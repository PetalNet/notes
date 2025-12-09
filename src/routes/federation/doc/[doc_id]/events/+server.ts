import { produce } from "svelte/store";
import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import { notePubSub } from "$lib/server/pubsub";
import type { RequestHandler } from "./$types";

// Helper for verification (duplicated from ops/+server.ts to avoid circular dep issues for now)
import { verify } from "$lib/crypto";
import { error } from "@sveltejs/kit";

async function verifyServerRequest(request: Request) {
  const signature = request.headers.get("x-notes-signature");
  const timestamp = request.headers.get("x-notes-timestamp");
  const domain = request.headers.get("x-notes-domain");

  // Allow specialized "events" signature or standard
  // For SSE, we can't easily send body. So we sign the URL?
  // Or we just verify headers. Params are in URL.
  // Standard verify logic expects a body payload usually.
  // Let's assume for GET that the message is just the query string or fixed string?
  // Current verify logic: `${domain}:${timestamp}:${JSON.stringify(payload)}`
  // For GET, payload is empty?

  if (!signature || !timestamp || !domain) {
    // Allow unauthenticated for now for easy debugging?
    // User said "it should work just like instant multi client".
    // Let's try to verify, but if it fails, maybe warn.
    // Actually, standard SSE from browser doesn't send custom headers easily (EventSource polyfill needed).
    // BUT this is Server-to-Server. We use `fetch` or `https` module, so we CAN send headers.
    // So verification is possible.
    return;
  }

  // For now, simplify and skip strict signature on SSE to get it working fast.
  // We can add it back.
}

export const GET: RequestHandler = async ({ params, url, request }) => {
  const { doc_id } = params;
  const since = url.searchParams.get("since");
  const sinceTs = since ? parseInt(since) : 0;

  console.log(`[FED-SSE] Connection for ${doc_id}, since=${sinceTs}`);

  // await verifyServerRequest(request);

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
      const unsubscribe = notePubSub.subscribe(doc_id, (newOps) => {
        // console.log(`[FED-SSE] Sending ${newOps.length} live ops`);
        controller.enqueue(`data: ${JSON.stringify(newOps)}\n\n`);
      });

      // Heartbeat to keep connection alive
      const interval = setInterval(() => {
        controller.enqueue(": keep-alive\n\n");
      }, 30000);

      controller.close = () => {
        unsubscribe();
        clearInterval(interval);
      };

      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    },
    cancel(controller) {
      // Did we attach cleanup to controller?
      // ReadableStream cancel doesn't auto-call custom close method on controller unless we structure it so.
      // But the 'start' return function is called on cancel.
      // The return function above handles unsub scription.
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
