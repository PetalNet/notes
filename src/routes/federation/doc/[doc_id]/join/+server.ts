import { json, error } from "@sveltejs/kit";
import { getServerIdentity } from "$lib/server/identity";
import { verify, decryptKeyForDevice } from "$lib/crypto";
import { db } from "$lib/server/db";
import { documents, members, notes, users } from "$lib/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  fetchUserIdentity,
  generateKeyEnvelopesForUsers,
} from "$lib/server/federation";
import { parseNoteId } from "$lib/noteId";

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
  console.log("=== JOIN ENDPOINT START ===");
  console.log("  doc_id from params:", doc_id);
  console.log("  decoded doc_id:", decodeURIComponent(doc_id));

  const body = await request.json();
  const { requesting_server, users: joiningUsers } = body;
  console.log("  requesting_server:", requesting_server);
  console.log("  joiningUsers:", joiningUsers);

  // Verify signature
  const remoteServer = await verifyServerRequest(request, body);
  console.log("  remoteServer verified:", remoteServer?.domain);

  // 1. Check if doc exists
  // The doc_id may be a full portable ID (e.g., bG9jYWxob3N0OjUxNzM~uuid) or just a UUID
  // Try the full ID first, then try to parse and use UUID as fallback

  // First try with the raw doc_id from params
  console.log("  Searching for doc_id:", doc_id);
  let doc = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });
  console.log("  documents.findFirst(doc_id):", doc?.id || "NOT FOUND");

  let note = await db.query.notes.findFirst({
    where: eq(notes.id, doc_id),
  });
  console.log("  notes.findFirst(doc_id):", note?.id || "NOT FOUND");

  // Try with decoded doc_id (in case it was URL-encoded)
  const decodedDocId = decodeURIComponent(doc_id);
  if (!note && !doc && decodedDocId !== doc_id) {
    console.log("  Trying decoded doc_id:", decodedDocId);
    doc = await db.query.documents.findFirst({
      where: eq(documents.id, decodedDocId),
    });
    console.log("  documents.findFirst(decoded):", doc?.id || "NOT FOUND");

    note = await db.query.notes.findFirst({
      where: eq(notes.id, decodedDocId),
    });
    console.log("  notes.findFirst(decoded):", note?.id || "NOT FOUND");
  }

  // If not found with full ID, the ID might already exist as just a UUID (legacy)
  if (!note && !doc) {
    // Try parsing the portable ID to extract the UUID
    const { uuid } = parseNoteId(decodedDocId);
    console.log("  Parsed UUID from portable ID:", uuid);
    if (uuid && uuid !== decodedDocId) {
      doc = await db.query.documents.findFirst({
        where: eq(documents.id, uuid),
      });
      console.log("  documents.findFirst(uuid):", doc?.id || "NOT FOUND");

      note = await db.query.notes.findFirst({
        where: eq(notes.id, uuid),
      });
      console.log("  notes.findFirst(uuid):", note?.id || "NOT FOUND");
    }
  }

  if (!note && !doc) {
    // List all notes in DB for debugging
    const allNotes = await db.query.notes.findMany({ limit: 5 });
    console.log(
      "  All notes in DB (first 5):",
      allNotes.map((n) => n.id),
    );
    console.error(`  Document not found: ${doc_id}`);
    throw error(404, "Document not found");
  }

  console.log("  Found note:", note?.id, "accessLevel:", note?.accessLevel);

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

  // 3. For authenticated/open notes, generate encrypted keys for joining users
  const snapshot = note?.loroSnapshot || null;
  const encryptedDocKey = note?.documentKeyEncrypted || note?.encryptedKey;

  if (!encryptedDocKey) {
    throw error(500, "Document key not found");
  }

  // Get the owner's private key to decrypt the document key
  // Note: In a real E2EE system, the server wouldn't have access to decrypted keys
  // This is a simplified approach where the server can re-encrypt for new users
  const owner = await db.query.users.findFirst({
    where: eq(users.id, note?.ownerId || ""),
  });

  if (!owner) {
    throw error(500, "Document owner not found");
  }

  // For authenticated/open notes, we'll generate envelopes by:
  // 1. Fetching user public keys from requesting_server
  // 2. Encrypting the document key for each user

  const serverIdentity = await getServerIdentity();

  // Decrypt the doc key first!
  // Decrypt the doc key first!
  let rawDocKey = encryptedDocKey;
  console.log(`[JOIN] encryptedDocKey Length: ${encryptedDocKey.length}`);

  if (encryptedDocKey.length > 44) {
    if (owner.privateKeyEncrypted) {
      console.log(
        `[JOIN] Owner PrivKey Length: ${owner.privateKeyEncrypted.length}`,
      );
      try {
        console.log(`[JOIN] Decrypting owner key for re-encryption...`);
        rawDocKey = decryptKeyForDevice(
          encryptedDocKey,
          owner.privateKeyEncrypted,
        );
        console.log(`[JOIN] Decrypted Raw Key Length: ${rawDocKey.length}`);
      } catch (e) {
        console.error(`[JOIN] Failed to decrypt owner key:`, e);
        throw error(500, "Failed to decrypt note key for sharing");
      }
    } else {
      console.error(`[JOIN] Owner has no private key! CANNOT DECRYPT.`);
      // CRITICAL: Do not allow double encryption. Fail here.
      throw error(
        500,
        "Owner missing private key - cannot share authenticated note",
      );
    }
  } else {
    console.log(
      `[JOIN] Key is already raw (Length: ${encryptedDocKey.length})`,
    );
  }

  // Debug Identity Fetching
  for (const handle of joiningUsers) {
    const id = await fetchUserIdentity(handle, requesting_server);
    console.log(
      `  [DEBUG] Fetched Identity for ${handle}:`,
      JSON.stringify(id),
    );
    if (id?.publicKey) {
      console.log(`  [DEBUG] Public Key for ${handle}: ${id.publicKey}`);
    }
  }

  const envelopes = await generateKeyEnvelopesForUsers(
    rawDocKey, // Now passing the RAW key
    joiningUsers,
    requesting_server,
  );

  // Ensure documents entry exists (required for members FK constraint)
  // Use the actual note ID (which may be a portable ID)
  const noteId = note?.id || doc_id;
  const docEntry = await db.query.documents.findFirst({
    where: eq(documents.id, noteId),
  });

  if (!docEntry) {
    console.log("  Creating documents entry for:", noteId);
    await db
      .insert(documents)
      .values({
        id: noteId,
        hostServer: "local",
        ownerId: note?.ownerId || "",
        title: note?.title || "Untitled",
        accessLevel: accessLevel,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Also add the joining users as members
  for (const envelope of envelopes) {
    console.log("  Adding member:", envelope.user_id);
    await db
      .insert(members)
      .values({
        docId: noteId,
        userId: envelope.user_id,
        deviceId: envelope.device_id,
        role: "writer",
        encryptedKeyEnvelope: envelope.encrypted_key,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [members.docId, members.userId, members.deviceId],
        set: {
          encryptedKeyEnvelope: envelope.encrypted_key,
          role: "writer",
        },
      });
  }

  return json({
    doc_id,
    snapshot,
    envelopes,
    title: note?.title || "Untitled",
    ownerId: note?.ownerId,
    accessLevel,
  });
}
