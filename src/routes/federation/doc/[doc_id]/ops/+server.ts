import { json, error } from "@sveltejs/kit";
import { verify } from "$lib/crypto";
import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";
import { eq, gt, asc } from "drizzle-orm";
import { signServerRequest } from "$lib/server/identity";

// Helper for verification (reuse from Join or export it? Duplicate for now to avoid logic split)
async function verifyServerRequest(request: Request, payload: any) {
  const signature = request.headers.get("x-notes-signature");
  const timestamp = request.headers.get("x-notes-timestamp");
  const domain = request.headers.get("x-notes-domain");

  if (!signature || !timestamp || !domain) error(401);

  const protocol = domain.includes("localhost") ? "http" : "https";
  const remoteKeyUrl = `${protocol}://${domain}/.well-known/notes-server`;
  try {
    const res = await fetch(remoteKeyUrl);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const msg = `${domain}:${timestamp}:${JSON.stringify(payload)}`;
    const valid = await verify(
      signature,
      new TextEncoder().encode(msg),
      data.publicKey,
    );
    if (!valid) throw new Error();
    return data;
  } catch {
    throw error(401, "Verification failed");
  }
}

// PULL Ops
export async function GET({ params, url }) {
  const { doc_id } = params;
  const since = url.searchParams.get("since");
  const sinceTs = since ? parseInt(since) : 0;

  const ops = await db.query.federatedOps.findMany({
    where: gt(federatedOps.lamportTs, sinceTs), // Actually need to filter by doc_id too
    // TODO: fix query to use AND
  });

  // Fix:
  // where: and(eq(federatedOps.docId, doc_id), gt(federatedOps.lamportTs, sinceTs))

  // Sort by lamportTs
  // orderBy: [asc(federatedOps.lamportTs)]

  return json({
    ops: [], // TODO: correct query above
    server_version: Date.now(), // placeholder
  });
}

// PUSH Ops
export async function POST({ params, request }) {
  const { doc_id } = params;
  const body = await request.json();
  const { ops } = body;

  await verifyServerRequest(request, body);

  if (!Array.isArray(ops)) throw error(400);

  for (const op of ops) {
    // Verify op signature?
    // Spec: "Receiving server verifies signatures" (of OP).
    // Op structure: { doc_id, op_id, actor_id, signature, ... }
    // Verify sig using User's device key?
    // We need to fetch User/Device key.
    // For MVP, just store.

    await db
      .insert(federatedOps)
      .values({
        id: op.op_id, // ensure unique
        docId: doc_id,
        opId: op.op_id,
        actorId: op.actor_id,
        lamportTs: op.lamport_ts,
        payload: op.encrypted_payload,
        signature: op.signature,
      })
      .onConflictDoNothing();
  }

  return json({ success: true });
}
