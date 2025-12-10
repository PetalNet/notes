import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { federatedOps, documents } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { signServerRequest } from "$lib/server/identity";
import { notePubSub } from "$lib/server/pubsub";
import { parseNoteId } from "$lib/noteId";

export async function POST({ params, request, locals }) {
  const { doc_id } = params;
  const body = await request.json();
  const { op } = body;

  let doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  // Handle ephemeral/anonymous notes (not in DB)
  if (!doc) {
    try {
      const { origin } = parseNoteId(doc_id);
      if (origin) {
        console.log(`[CLIENT] Infers ephemeral note origin: ${origin}`);
        doc = { hostServer: origin, accessLevel: "public" } as any;
      }
    } catch (e) {
      console.warn("Failed to parse ephemeral ID for push:", e);
    }
  }

  // Permission Check
  if (!doc) {
    throw error(404, "Note not found");
  }

  // If private and not logged in, deny
  if (doc.accessLevel === "private" && !locals.user) {
    throw error(401, "Unauthorized");
  }
  // TODO: fine-grained auth for 'mixed' mode (e.g. public read, private write)
  // For now, if it's 'public' or 'open', we allow anonymous writes.

  if (doc.hostServer !== "local") {
    // Proxy to remote server
    console.log(
      `[CLIENT] Proxying push to remote server: ${doc.hostServer} for ${doc_id}`,
    );

    const remoteUrl = `http://${doc.hostServer}/federation/doc/${encodeURIComponent(doc_id)}/ops`;
    const payload = { ops: [op] };

    console.log(`[CLIENT] Signing request...`);
    // We sign as the SERVER, not the user.
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
      // If remote 401s, we 401?
      throw error(res.status, "Remote push failed");
    }
  }

  // Store Op locally ONLY if we have a real local document record
  // Ephemeral notes (doc.hostServer inferred but not in DB) cannot store ops locally due to FK.
  // We check if the doc was actually found in DB.
  // We can check if 'createdAt' exists or similar, but cleaner is to re-check specific flag or use original query result.
  // Actually, 'doc' is mutated above.
  // Let's rely on checking if it exists in DB.

  // Re-query or check if it has an ID/real fields?
  // The 'doc' variable might be our mock object.
  // Check if we can just generic 'try/catch' the insert.

  try {
    // Check if doc exists in DB using a quick query or assume from context.
    // If we just pushed to remote, we might be done.
    // But if we are the HOST, we MUST insert.
    // If doc.hostServer is local, then 'doc' MUST be from DB (since we can't infer local origin from ID for *new* notes without DB record usually, unless we are being hacked).
    // Actually, if !doc, we only inferred if origin != null.

    // Simplest: Try insert. If FK violation, ignore?
    // But we don't want to throw 500.

    // Only insert if we think it's in the DB.
    // Since we don't distinguish easily with the 'doc' var reuse, let's just attempt insert and catch specific error, or only insert if hostServer is local?
    // No, we cache remote ops too IF we have the doc stub.

    // Better: Helper variable 'existsInDb'.
    const existsInDb = !!(await db.query.documents.findFirst({
      where: eq(documents.id, doc_id),
      columns: { id: true },
    }));

    if (existsInDb) {
      console.log(
        `[CLIENT] Inserting op ${op.op_id} into federatedOps (docId: ${doc_id})`,
      );
      const normalizedOp = {
        id: op.op_id,
        docId: doc_id,
        opId: op.op_id,
        actorId: op.actor_id,
        lamportTs: op.lamport_ts,
        payload: op.encrypted_payload,
        signature: op.signature,
        createdAt: new Date(),
      };

      await db.insert(federatedOps).values(normalizedOp).onConflictDoNothing();
      console.log(`[CLIENT] Local insertion successful for ${op.op_id}`);

      // Publish to PubSub
      notePubSub.publish(doc_id, [normalizedOp]);
    } else {
      console.log(
        `[CLIENT] Skipping local storage for ephemeral/remote note ${doc_id}`,
      );
      // But we DO need to publish to PubSub so the Client SSE (which is listening) gets the echo back!
      // The Client SSE subscribes to notePubSub.
      // So anonymous user sees their own change reflected immediately?
      // Or do they wait for remote roundtrip?
      // If we proxy, the remote executes.
      // Does the remote send it back via SSE?
      // Yes, if we are subscribed.

      // Optimistic local update via PubSub even if not in DB?
      // notePubSub is memory-based. So YES/safe.
      notePubSub.publish(doc_id, [
        {
          ...op,
          payload: op.encrypted_payload, // map for client compatibility
        } as any,
      ]);
    }
  } catch (err) {
    console.error(`[CLIENT] Local insertion failed for ${op.op_id}:`, err);
    // If we successfully proxied, maybe don't fail the whole request?
    // If local, we must fail.
    if (doc.hostServer === "local") {
      throw error(500, "Failed to store operation locally");
    }
  }

  return json({ success: true });
}
