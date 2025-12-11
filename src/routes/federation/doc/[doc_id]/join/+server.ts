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

// Helper to verify request signature
async function verifyServerRequest(request: Request, payload: any) {
  const signature = request.headers.get("x-notes-signature");
  const timestamp = request.headers.get("x-notes-timestamp");
  const domain = request.headers.get("x-notes-domain");

  if (!signature || !timestamp || !domain) {
    error(401, "Missing signature headers");
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

    if (!valid) error(401, "Invalid signature");
    return data; // validated server info
  } catch (e) {
    console.error("Verification failed", e);
    error(401, "Verification failed");
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
  // The doc_id MUST be a full portable ID (e.g., bG9jYWxob3N0OjUxNzM~uuid)
  console.log("  Searching for doc_id:", doc_id);

  // Try with decoded doc_id (in case it was URL-encoded)
  const decodedDocId = decodeURIComponent(doc_id);

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, decodedDocId),
  });
  console.log("  documents.findFirst(decoded):", doc?.id ?? "NOT FOUND");

  const note = await db.query.notes.findFirst({
    where: eq(notes.id, decodedDocId),
  });
  console.log("  notes.findFirst(decoded):", note?.id ?? "NOT FOUND");

  if (!note && !doc) {
    // List all notes in DB for debugging
    const allNotes = await db.query.notes.findMany({ limit: 5 });
    console.log(
      "  All notes in DB (first 5):",
      allNotes.map((n) => n.id),
    );
    console.error(`  Document not found: ${doc_id}`);
    error(404, "Document not found");
  }

  console.log("  Found note:", note?.id, "accessLevel:", note?.accessLevel);

  // 2. Check permissions based on access_level
  const accessLevel = note?.accessLevel ?? doc?.accessLevel ?? "private";

  if (accessLevel === "private" || accessLevel === "invite_only") {
    // Require pre-existing membership for private/invite-only notes
    const memberRows = await db.query.members.findMany({
      where: and(
        eq(members.docId, decodedDocId),
        inArray(members.userId, joiningUsers),
      ),
    });

    if (memberRows.length === 0) {
      error(403, "This note is private. You must be invited to access it.");
    }
    // Permission granted! Fall through to generate fresh envelopes.
  }

  // 3. For authenticated/open notes, generate encrypted keys for joining users
  const snapshot = note?.loroSnapshot ?? undefined;
  const encryptedDocKey = note?.documentKeyEncrypted ?? note?.encryptedKey;

  if (!encryptedDocKey) {
    error(500, "Document key not found");
  }

  // Get the owner's private key to decrypt the document key
  // Note: In a real E2EE system, the server wouldn't have access to decrypted keys
  // This is a simplified approach where the server can re-encrypt for new users
  const owner = await db.query.users.findFirst({
    where: eq(users.id, note.ownerId),
  });

  if (!owner) {
    error(500, "Document owner not found");
  }

  // For authenticated/open notes, we'll generate envelopes by:
  // 1. Fetching user public keys from requesting_server
  // 2. Encrypting the document key for each user

  const serverIdentity = await getServerIdentity();

  // 4. Try to use Server Escrow (Key Broker)
  let rawDocKey = "";

  // Special Handling for Open Public Notes
  if (accessLevel === "public" || accessLevel === "open") {
    console.log(
      "[JOIN] Public Note Access. Decrypting for anonymous access...",
    );
    if (doc?.serverEncryptedKey) {
      try {
        rawDocKey = await decryptKeyForDevice(
          doc.serverEncryptedKey,
          serverIdentity.encryptionPrivateKey,
        );
      } catch (e) {
        console.error("[JOIN] Failed to decrypt public note key:", e);
        error(500, "Failed to unlock public note");
      }
    } else if (encryptedDocKey.length <= 44) {
      rawDocKey = encryptedDocKey; // Legacy public
    }

    // If we have the raw key, return it immediately for the anonymous user
    if (rawDocKey) {
      return json({
        doc_id: decodedDocId,
        snapshot,
        envelopes: [], // No envelopes needed for public Key
        rawKey: rawDocKey, // Send RAW key to anonymous user
        title: note?.title ?? "Untitled",
        ownerId: note?.ownerId,
        accessLevel,
      });
    }
  }

  // Check if we have the key escrowed in the documents table
  if (doc?.serverEncryptedKey) {
    console.log(
      "[JOIN] Found serverEncryptedKey. Attempting to broker key exchange...",
    );
    try {
      rawDocKey = await decryptKeyForDevice(
        doc.serverEncryptedKey,
        serverIdentity.encryptionPrivateKey,
      );
      console.log(
        "[JOIN] Successfully decrypted Note Key using Server Identity.",
      );
    } catch (e) {
      console.error("[JOIN] Server failed to decrypt escrowed key:", e);
    }
  }

  // Fallback: If no server key, check if existing doc key is already raw (public/legacy)
  if (!rawDocKey) {
    if (encryptedDocKey.length <= 44) {
      console.log(
        `[JOIN] Key appears to be raw (Length: ${encryptedDocKey.length})`,
      );
      rawDocKey = encryptedDocKey;
    } else {
      // The key is encrypted (E2EE) and we don't have a broker copy.
      // The server CANNOT decrypt the note key to re-encrypt it for the joining user.
      console.warn(
        `[JOIN] Request for E2EE note ${note?.id}. Server cannot fulfill automatically (No Escrow).`,
      );
      error(
        424,
        "E2EE_KEY_UNAVAILABLE: Server cannot decrypt note key. The owner must be online to approve or the note must be shared via client-side flow.",
      );
    }
  }

  // Special Handling for Password Protected Notes
  if (accessLevel === "password_protected") {
    console.log("[JOIN] Password Protected Note.");
    if (doc?.passwordEncryptedKey) {
      return json({
        doc_id: decodedDocId,
        snapshot,
        envelopes: [],
        passwordEncryptedKey: doc.passwordEncryptedKey,
        title: note?.title ?? "Untitled",
        ownerId: note?.ownerId,
        accessLevel,
      });
    } else {
      // If password key is missing, it's an error state for this mode
      error(
        424,
        "PASSWORD_KEY_UNAVAILABLE: Note is password protected but no password key was found.",
      );
    }
  }

  // Debug Identity Fetching
  for (const handle of joiningUsers) {
    await fetchUserIdentity(handle, requesting_server);
  }

  const envelopes = await generateKeyEnvelopesForUsers(
    rawDocKey, // Now passing the RAW key
    joiningUsers,
    requesting_server,
  );

  // Ensure documents entry exists (required for members FK constraint)
  // Use the actual note ID (which may be a portable ID)
  const noteId = note?.id ?? decodedDocId;
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
        ownerId: note?.ownerId ?? "",
        title: note?.title ?? "Untitled",
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
    doc_id: decodedDocId,
    snapshot,
    envelopes,
    title: note?.title ?? "Untitled",
    ownerId: note?.ownerId,
    accessLevel,
  });
}
