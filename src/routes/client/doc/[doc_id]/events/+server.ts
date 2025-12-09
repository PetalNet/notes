import { db } from "$lib/server/db";
import { federatedOps, documents } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
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
      while (true) {
        try {
          if (isRemote) {
            // Poll remote server
            // Ideally we'd subscribe to SSE, but for MVP polling is safer/easier
            // We need to sign this request? Or is it public?
            // Federation ops endpoint currently requires signature.

            // Note: Efficient way would be to proxy the SSE connection directly?
            // But we need to sign the request as the server.

            // Let's implement polling for now to match local logic
            const remoteUrl = `http://${doc.hostServer}/federation/doc/${encodeURIComponent(doc_id)}/ops?since=${lastTs}`;

            // GET request doesn't have body, but we need headers.
            // Ops endpoint checks signature on headers.
            // It validates against NO body for GET?
            // Checking ops/+server.ts: verifyServerRequest checks body?
            // Wait, verifyServerRequest uses JSON.stringify(payload).
            // If payload is empty body, verify logic needs to handle that.
            // GET /ops logic in previous step didn't call verifyServerRequest.
            // Let's check ops/+server.ts content again.
            // GET handler checks DB directly. It does NOT call verifyServerRequest.
            // So it's effectively public? Or relies on something else?
            // It just returns ops.
            // Ops are encrypted. So maybe it's fine.
            // IF it's public, we don't need signature.

            // console.log(`[CLIENT] Polling remote events from ${remoteUrl}`);
            const res = await fetch(remoteUrl);
            if (res.ok) {
              const data = await res.json();
              if (data.ops && data.ops.length > 0) {
                console.log(`[CLIENT] Received ${data.ops.length} remote ops`);
                const message = JSON.stringify(data.ops);
                controller.enqueue(`data: ${message}\n\n`);
                const maxTs = Math.max(
                  ...data.ops.map((o: any) => o.lamportTs),
                );
                if (maxTs > lastTs) lastTs = maxTs;
              }
            } else {
              console.warn(`[CLIENT] Remote polling failed: ${res.status}`);
            }
          } else {
            // Local polling (existing logic)
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
          }

          await new Promise((r) => setTimeout(r, 50));
        } catch (e) {
          // Error or closed?
          console.error("Stream error:", e);
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
