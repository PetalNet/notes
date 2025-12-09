import { db } from "$lib/server/db";
import { federatedOps, documents } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { notePubSub } from "$lib/server/pubsub";
export const GET: RequestHandler = async ({ params, url }) => {
  const { doc_id } = params;
  const since = url.searchParams.get("since");
  // Default to 0 (beginning of time) to fetch full history if 'since' is not provided.
  // This ensures that when a client connects (especially for the first time),
  // it receives all existing ops to reconstruct the document state.
  let lastTs = since ? parseInt(since) : 0;

  console.log(`[EVENTS] Connection request for ${doc_id}, since=${since}`);

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  if (!doc) {
    console.error(`[EVENTS] Document not found: ${doc_id}`);
    throw error(404, "Document not found");
  }

  const isRemote = doc && doc.hostServer !== "local";

  const stream = new ReadableStream({
    async start(controller) {
      let remoteReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let abortController: AbortController | null = null;
      let heartbeat: NodeJS.Timeout | null = null;

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
          while (true) {
            const { done, value } = await remoteReader.read();
            if (done) break;
            controller.enqueue(value);
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
          const unsubscribe = notePubSub.subscribe(doc_id, (newOps) => {
            controller.enqueue(`data: ${JSON.stringify(newOps)}\n\n`);
          });

          // Keep alive
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(": keep-alive\n\n");
            } catch (e) {
              clearInterval(heartbeat!);
            }
          }, 30000);

          // Wait until closed
          await new Promise((resolve) => {
            // This promise pends forever until stream is cancelled
            // The loop below (if we had one) would wait.
            // Since we use callbacks, we just need to keep this scope alive?
            // Actually start() can return a promise that keeps running.
          });

          unsubscribe();
        }
      } catch (e) {
        console.error("[CLIENT-SSE] Stream error:", e);
        if (remoteReader) remoteReader.cancel();
        if (abortController) abortController.abort();
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() {
      // Cleanup happens above if logic is structure correctly,
      // but standard approach is to use returned cancel function.
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
