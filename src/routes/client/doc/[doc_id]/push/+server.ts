import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { federatedOps } from "$lib/server/db/schema";

export async function POST({ params, request, locals }) {
  const { doc_id } = params;
  const body = await request.json();
  const { op } = body;
  // Op structure: { op_id, actor_id, lamport_ts, encrypted_payload, signature }

  if (!locals.user) {
    // Validation check (auth)
    // Only members can write?
    // Check member role.
  }

  // Store Op
  await db
    .insert(federatedOps)
    .values({
      id: op.op_id,
      docId: doc_id,
      opId: op.op_id,
      actorId: op.actor_id,
      lamportTs: op.lamport_ts,
      payload: op.encrypted_payload, // or 'payload' in DB
      signature: op.signature,
    })
    .onConflictDoNothing();

  // Trigger SSE?
  // If using in-memory bus, emit here.

  return json({ success: true });
}
