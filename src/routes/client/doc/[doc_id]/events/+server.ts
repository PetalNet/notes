import { db } from "$lib/server/db";
import { federatedOps, documents } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { notePubSub } from "$lib/server/pubsub";
import { parseNoteId } from "$lib/noteId";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async ({ params, url }) => {
  const { doc_id } = params;
  console.log("HIT-SSE: Handler invoked for", doc_id);
  const since = url.searchParams.get("since");
  // Default to 0 (beginning of time) to fetch full history if 'since' is not provided.
  let lastTs = since ? parseInt(since) : 0;

  console.log(`[EVENTS] Connection request for ${doc_id}, since=${since}`);

  let doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  // If not in DB, check if it's a valid remote ID (Ephemeral/Anonymous access)
  if (!doc) {
    try {
      const { origin } = parseNoteId(doc_id);

      if (origin) {
        console.log(
          `[EVENTS] Ephemeral note inferred from ID. Origin: ${origin}. Proxying...`,
        );
        doc = { hostServer: origin } as any;
      }
    } catch (e) {
      console.error("[EVENTS] ERROR parsing note ID:", e);
      // Fallthrough to 404
    }
  }

  if (!doc) {
    console.error(`[EVENTS] Document not found: ${doc_id}`);
    throw error(404, "Document not found");
  }

  const isRemote = doc && doc.hostServer !== "local";

  let remoteReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let abortController: AbortController | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isRemote) {
          console.log(`[CLIENT-SSE] Proxying to remote ${doc.hostServer}`);

          // Connect to remote SSE
          const remoteUrl = `http://${doc.hostServer}/federation/doc/${encodeURIComponent(doc_id)}/events?since=${lastTs}`;

          // We need to sign this if we enforce auth, but we relaxed it for now.
          abortController = new AbortController();
          const response = await fetch(remoteUrl, {
            headers: {
              Accept: "text/event-stream",
            },
            signal: abortController.signal,
          });

          if (!response.ok || !response.body) {
            console.error(
              `[CLIENT-SSE] Remote connection failed:`,
              response.status,
            );
            throw new Error(`Remote SSE failed: ${response.status}`);
          }

          remoteReader = response.body.getReader();

          // Pipe remote stream to local controller
          // Combine with local PubSub to get instant updates from other local users
          unsubscribe = notePubSub.subscribe(doc_id, (newOps) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(newOps)}\n\n`);
            } catch (e) {
              console.warn(
                "[CLIENT-SSE] Failed to enqueue local op (stream closed?):",
                e,
              );
            }
          });

          // Pipe remote stream to local controller
          // This must be awaited to keep the stream open
          try {
            while (true) {
              const { done, value } = await remoteReader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (e) {
            console.error("[CLIENT-SSE] Remote stream error:", e);
            controller.error(e);
          } finally {
            // Ensure we unsubscribe from local updates when remote stream ends or errors
            if (unsubscribe) unsubscribe();
          }
        } else {
          // Local logic: Monitor DB (Polling or PubSub locally too?)
          // For local, we can ALSO use PubSub!
          // But 'events/+server.ts' is used by the client.
          // IF we use PubSub locally, we get instant updates for local users too (multi-tab/window).

          // notePubSub is imported statically
          // 1. Initial history
          const ops = await db.query.federatedOps.findMany({
            where: and(
              eq(federatedOps.docId, doc_id),
              gt(federatedOps.lamportTs, lastTs),
            ),
            orderBy: [asc(federatedOps.lamportTs)],
          });

          if (ops.length > 0) {
            controller.enqueue(`data: ${JSON.stringify(ops)}\n\n`);
          }

          // 2. Subscribe
          unsubscribe = notePubSub.subscribe(doc_id, (newOps) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(newOps)}\n\n`);
            } catch (e) {
              console.warn(
                "[CLIENT-SSE] Failed to enqueue (stream closed?):",
                e,
              );
              // Unsubscribe to prevent future errors?
              // The controller.close() or cancel should have triggered cleanup,
              // but if we are here, maybe it didn't yet.
            }
          });

          // Keep alive
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(": keep-alive\n\n");
            } catch (e) {
              if (heartbeat) clearInterval(heartbeat);
            }
          }, 30000);

          // Never resolve, keep stream open until cancelled
          await new Promise(() => {});
        }
      } catch (e) {
        console.error("[CLIENT-SSE] Stream error:", e);
        // If error occurs, we should cleanup and close
        if (remoteReader) remoteReader.cancel();
        if (abortController) abortController.abort();
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {} // ignore if already closed
      }
    },
    cancel() {
      console.log(`[CLIENT-SSE] Stream cancelled for ${doc_id}`);
      if (remoteReader) remoteReader.cancel();
      if (abortController) abortController.abort();
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
