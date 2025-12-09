import { json, error } from "@sveltejs/kit";
import { getServerIdentity } from "$lib/server/identity";
import { verify } from "$lib/crypto";
import { db } from "$lib/server/db";
import { documents, members, notes } from "$lib/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";

// Helper to verify request signature
async function verifyServerRequest(request: Request, payload: any) {
  const signature = request.headers.get("x-notes-signature");
  const timestamp = request.headers.get("x-notes-timestamp");
  const domain = request.headers.get("x-notes-domain");

  if (!signature || !timestamp || !domain) {
    throw error(401, "Missing signature headers");
  }

  // Fetch remote server key
  // In production, we would cache this or use a more robust discovery
  // For local dev, we might assume http? Or https with ignore cert?
  const protocol = domain.includes("localhost") ? "http" : "https";
  const remoteKeyUrl = `${protocol}://${domain}/.well-known/notes-server`;

  try {
    const res = await fetch(remoteKeyUrl);
    if (!res.ok) throw new Error("Failed to fetch server key");
    const data = await res.json();
    if (data.domain !== domain) throw new Error("Domain mismatch");

    const msg = `${domain}:${timestamp}:${JSON.stringify(payload)}`;
    const valid = await verify(
      signature,
      new TextEncoder().encode(msg),
      data.publicKey,
    );

    if (!valid) throw error(401, "Invalid signature");
    return data; // validated server info
  } catch (e) {
    console.error("Verification failed", e);
    throw error(401, "Verification failed");
  }
}

export async function POST({ params, request }) {
  const { doc_id } = params;
  const body = await request.json();
  const { requesting_server, users: joiningUsers } = body;

  // Verify signature
  await verifyServerRequest(request, body);

  // 1. Check if doc exists
  // Note: querying 'documents' table. If using 'notes', switch to 'notes' or ensure 'documents' populated.
  // For now assuming 'documents' table is used for federation metadata.
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  // Fallback to checking `notes` if `documents` empty?
  // If we haven't migrated existing notes to `documents`, check `notes`.
  let note;
  if (!doc) {
    note = await db.query.notes.findFirst({
      where: eq(notes.id, doc_id),
    });
    if (!note) throw error(404, "Document not found");
    // Implicitly hosted here if local note found?
  } else {
    note = await db.query.notes.findFirst({ where: eq(notes.id, doc_id) });
  }

  // 2. Check permissions based on access_level
  const accessLevel = note?.accessLevel || doc?.accessLevel || "private";

  if (accessLevel === "private" || accessLevel === "invite_only") {
    // Require pre-existing membership for private/invite-only notes
    const memberRows = await db.query.members.findMany({
      where: and(
        eq(members.docId, doc_id),
        inArray(members.userId, joiningUsers),
      ),
    });

    if (memberRows.length === 0) {
      throw error(
        403,
        "This note is private. You must be invited to access it.",
      );
    }

    // Return existing envelopes for invited users
    const snapshot = note?.loroSnapshot || null;
    return json({
      doc_id,
      snapshot,
      envelopes: memberRows.map((m) => ({
        user_id: m.userId,
        device_id: m.deviceId,
        encrypted_key: m.encryptedKeyEnvelope,
      })),
      title: note?.title || "Untitled",
      ownerId: note?.ownerId,
    });
  }

  // 4. For authenticated/open notes, generate encrypted keys for joining users
  // Need to fetch their public keys from their server
  const snapshot = note?.loroSnapshot || null;
  const documentKey = note?.documentKeyEncrypted || note?.encryptedKey;

  if (!documentKey) {
    throw error(500, "Document key not found");
  }

  // For now, return  a temporary solution: let client generate own key
  // TODO: Implement proper key exchange:
  // 1. Fetch user public keys from requesting_server/.well-known/notes-identity/[user]
  // 2. Decrypt document key (if encrypted for owner)
  // 3. Re-encrypt for each joining user's public key
  // 4. Return encrypted envelopes

  return json({
    doc_id,
    snapshot,
    envelopes: [], // Empty for now - client will generate key
    title: note?.title || "Untitled",
    ownerId: note?.ownerId,
    accessLevel,
  });
}
