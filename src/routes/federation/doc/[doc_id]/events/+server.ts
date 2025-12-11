import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import { notePubSub } from "$lib/server/pubsub";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ params, url }) => {
  const { doc_id } = params;
  const since = url.searchParams.get("since");
  const sinceTs = since ? parseInt(since) : 0;

  console.log(`[FED-SSE] Connection for ${doc_id}, since=${sinceTs}`);

  // await verifyServerRequest(request);

  let unsubscribe: (() => void) | undefined;
  let interval: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send History
      const ops = await db.query.federatedOps.findMany({
        where: and(
          eq(federatedOps.docId, doc_id),
          gt(federatedOps.lamportTs, sinceTs),
        ),
        orderBy: [asc(federatedOps.lamportTs)],
      });

      if (ops.length > 0) {
        console.log(`[FED-SSE] Sending ${ops.length} historical ops`);
        controller.enqueue(`data: ${JSON.stringify(ops)}\n\n`);
      }

      // 2. Subscribe to real-time updates
      unsubscribe = notePubSub.subscribe(doc_id, (newOps) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(newOps)}\n\n`);
        } catch (e) {
          // If we can't write, the stream is likely dead
          console.warn("[FED-SSE] Failed to enqueue (stream closed?):", e);
          if (unsubscribe) unsubscribe();
          if (interval) clearInterval(interval);
        }
      });

      // Heartbeat to keep connection alive
      interval = setInterval(() => {
        try {
          controller.enqueue(": keep-alive\n\n");
        } catch (e) {
          console.warn("[FED-SSE] Heartbeat failed:", e);
          if (interval) clearInterval(interval);
          if (unsubscribe) unsubscribe();
        }
      }, 30000);

      try {
        await new Promise(() => {
          // Keep stream open forever
        });
      } catch {
        // Ignored
      }
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (interval) clearInterval(interval);
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
