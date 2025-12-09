import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
  const { doc_id } = params;
  const since = url.searchParams.get("since");
  let lastTs = since ? parseInt(since) : Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        try {
          // Check if client is still connected?
          // ReadableStream doesn't inherently check unless we try to enqueue and it errors?
          // SvelteKit/Node might abort controller?

          // Poll
          // Fetch ops newer than lastTs for this doc
          const newOps = await db.query.federatedOps.findMany({
            where: and(
              eq(federatedOps.docId, doc_id),
              gt(federatedOps.lamportTs, lastTs),
            ),
            orderBy: [asc(federatedOps.lamportTs)],
          });

          if (newOps.length > 0) {
            const message = JSON.stringify(newOps);
            controller.enqueue(`data: ${message}\n\n`);
            // Update lastTs to the max ts found
            const maxTs = Math.max(...newOps.map((o) => o.lamportTs));
            if (maxTs > lastTs) lastTs = maxTs;
          }

          await new Promise((r) => setTimeout(r, 1000));
        } catch (e) {
          // Error or closed?
          controller.close();
          break;
        }
      }
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
