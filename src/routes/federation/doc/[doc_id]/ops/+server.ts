import { json, error } from "@sveltejs/kit";
import { verify } from "$lib/crypto";
import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";
import { eq, gt, asc, and } from "drizzle-orm";
import { signServerRequest } from "$lib/server/identity";
import { notePubSub } from "$lib/server/pubsub";

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
    where: and(
      eq(federatedOps.docId, doc_id),
      gt(federatedOps.lamportTs, sinceTs),
    ),
    orderBy: [asc(federatedOps.lamportTs)],
  });

  return json({
    ops,
    server_version: Date.now(),
  });
}

// PUSH Ops
export async function POST({ params, request }) {
  const { doc_id } = params;
  console.log(`[FED] Received ops push for ${doc_id}`);

  const body = await request.json();
  const { ops } = body;
  console.log(`[FED] Ops count: ${ops?.length}`);

  try {
    await verifyServerRequest(request, body);
    console.log(`[FED] Verification successful`);
  } catch (e) {
    console.error(`[FED] Verification failed:`, e);
    throw e;
  }

  if (!Array.isArray(ops)) throw error(400);

  // Validate that the document exists first?
  // Ideally yes, but maybe we just accept ops for known docs.

  const normalizedOps = [];

  for (const op of ops) {
    console.log(`[FED] Inserting op ${op.op_id}`);
    const newOp = {
      id: op.op_id, // ensure unique
      docId: doc_id,
      opId: op.op_id,
      actorId: op.actor_id,
      lamportTs: op.lamport_ts,
      payload: op.encrypted_payload, // Note: client sends 'encrypted_payload' in JSON, but DB has 'payload'
      signature: op.signature,
      createdAt: new Date(), // Add timestamp
    };

    await db.insert(federatedOps).values(newOp).onConflictDoNothing();

    normalizedOps.push(newOp);
  }

  console.log(`[FED] Ops inserted successfully`);

  // Publish to PubSub for real-time subscribers
  notePubSub.publish(doc_id, normalizedOps);

  return json({ success: true });
}
