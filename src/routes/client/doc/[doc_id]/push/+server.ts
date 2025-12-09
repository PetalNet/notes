import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { federatedOps, documents } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { signServerRequest } from "$lib/server/identity";
import { notePubSub } from "$lib/server/pubsub";

export async function POST({ params, request, locals }) {
  const { doc_id } = params;
  const body = await request.json();
  const { op } = body;
  // Op structure: { op_id, actor_id, lamport_ts, encrypted_payload, signature }

  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  // Check if doc is remote
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  if (doc && doc.hostServer !== "local") {
    // Proxy to remote server
    console.log(
      `[CLIENT] Proxying push to remote server: ${doc.hostServer} for ${doc_id}`,
    );

    const remoteUrl = `http://${doc.hostServer}/federation/doc/${encodeURIComponent(doc_id)}/ops`;
    const payload = { ops: [op] }; // Federation endpoint expects array of ops

    console.log(`[CLIENT] Signing request...`);
    const {
      signature,
      timestamp,
      domain: requestDomain,
    } = await signServerRequest(payload);

    console.log(`[CLIENT] Sending fetch to ${remoteUrl}`);
    const res = await fetch(remoteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notes-signature": signature,
        "x-notes-timestamp": timestamp.toString(),
        "x-notes-domain": requestDomain,
      },
      body: JSON.stringify(payload),
    });

    console.log(`[CLIENT] Remote response status: ${res.status}`);
    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[CLIENT] Failed to push to remote server: ${res.status}`,
        text,
      );
      throw error(500, "Failed to push to remote server");
    }

    // We successfully pushed to remote.
    // Do we store it locally too?
    // Yes, otherwise we won't see our own changes if we reload/poll?
    // But strictly speaking, we should receive it back via sync/events.
    // However, for latency, we might want to store it.
    // BUT, if we store it, we might duplicate it when we poll?
    // `onConflictDoNothing` handles duplicates.
    // So safe to store locally too.
  }

  // Store Op locally (even if remote, to cache/optimistic update)
  try {
    console.log(
      `[CLIENT] Inserting op ${op.op_id} into federatedOps (docId: ${doc_id})`,
    );
    // Construct normalized Op matching DB schema
    const normalizedOp = {
      id: op.op_id,
      docId: doc_id,
      opId: op.op_id,
      actorId: op.actor_id,
      lamportTs: op.lamport_ts,
      payload: op.encrypted_payload, // Normalize to 'payload'
      signature: op.signature,
      createdAt: new Date(),
    };

    await db.insert(federatedOps).values(normalizedOp).onConflictDoNothing();
    console.log(`[CLIENT] Local insertion successful for ${op.op_id}`);

    // Publish to PubSub for real-time subscribers (Federation SSE & Local SSE)
    notePubSub.publish(doc_id, [normalizedOp]);
  } catch (err) {
    console.error(`[CLIENT] Local insertion failed for ${op.op_id}:`, err);
    throw error(500, "Failed to store operation locally");
  }

  return json({ success: true });
}
