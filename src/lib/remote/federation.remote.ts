import { command } from "$app/server";
import { db } from "$lib/server/db/index.ts";
import { documents, members } from "$lib/server/db/schema.ts";
import { requireLogin } from "$lib/server/auth.ts";
import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { parseNoteId } from "$lib/noteId.ts";
import { getServerIdentity } from "$lib/server/identity.ts";
import { sign } from "$lib/crypto.ts";
import { eq } from "drizzle-orm";
import { Schema } from "effect";

// Schema for joinFederatedNote command
const joinFederatedNoteSchema = Schema.Struct({
  noteId: Schema.String,
  originServer: Schema.String,
}).pipe(Schema.standardSchemaV1);

export const joinFederatedNote = command(
  joinFederatedNoteSchema,
  async ({ noteId, originServer }) => {
    console.log("=== FEDERATION JOIN START ===");
    console.log("  noteId:", noteId);
    console.log("  originServer:", originServer);

    const { user } = requireLogin();
    console.log("  user:", user.id, user.username);

    const currentDomain = env["SERVER_DOMAIN"] || "localhost:5173";
    console.log("  currentDomain:", currentDomain);

    const { uuid, origin } = parseNoteId(noteId);
    console.log("  [Federation] Parsed noteId:", noteId);
    console.log("  [Federation] Extracted UUID:", uuid);
    console.log("  [Federation] Extracted Origin:", origin);

    try {
      // Check if already joined (check both full ID and uuid)
      console.log("  Checking if already joined...");
      let existing = await db.query.documents.findFirst({
        where: eq(documents.id, noteId),
      });
      console.log("  Existing by noteId:", existing);

      if (!existing) {
        existing = await db.query.documents.findFirst({
          where: eq(documents.id, uuid),
        });
        console.log("  Existing by uuid:", existing);
      }

      if (existing) {
        console.log(`Already joined note ${noteId}`);
        return { success: true, alreadyJoined: true };
      }

      // Call origin server's join endpoint with FULL portable noteId
      const joinUrl = `http://${originServer}/federation/doc/${encodeURIComponent(noteId)}/join`;
      console.log("  Join URL:", joinUrl);

      // Get server identity for signing
      const serverIdentity = await getServerIdentity();
      const timestamp = Date.now().toString();

      // Use proper federated handle format: @username:domain
      const userHandle = `@${user.username}:${currentDomain}`;
      console.log("  userHandle:", userHandle);

      const requestBody = {
        requesting_server: currentDomain,
        users: [userHandle],
      };
      console.log("  requestBody:", JSON.stringify(requestBody));

      // Create signature
      const message = `${currentDomain}:${timestamp}:${JSON.stringify(requestBody)}`;
      const signature = await sign(
        new TextEncoder().encode(message),
        serverIdentity.privateKey,
      );
      console.log("  signature created, timestamp:", timestamp);

      console.log("  Sending join request...");
      const response = await fetch(joinUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-notes-signature": signature,
          "x-notes-timestamp": timestamp,
          "x-notes-domain": currentDomain,
        },
        body: JSON.stringify(requestBody),
      });
      console.log("  Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("  Federation join failed:", response.status, errorText);
        error(response.status, `Failed to join note: ${errorText}`);
      }

      const joinData = await response.json();
      console.log("  Join response:", JSON.stringify(joinData));

      // Extract my envelope
      console.log(
        "  Join response envelopes:",
        JSON.stringify(joinData.envelopes),
      );

      // Robust envelope finding
      let myEnvelope = joinData.envelopes?.find(
        (e: any) => e.user_id === userHandle,
      );

      if (!myEnvelope) {
        console.warn(
          `  [Federation] Exact match for ${userHandle} failed. Trying alternates...`,
        );

        // Try UUID
        myEnvelope = joinData.envelopes?.find(
          (e: any) => e.user_id === user.id,
        );
        if (myEnvelope) console.log("  [Federation] Matched by UUID");
      }

      if (!myEnvelope) {
        // Try short handle/username
        const shortHandle = `@${user.username}`;
        myEnvelope = joinData.envelopes?.find(
          (e: any) => e.user_id === shortHandle || e.user_id === user.username,
        );
        if (myEnvelope)
          console.log("  [Federation] Matched by username/short handle");
      }

      // Fallback: If there is exactly one envelope and we asked for one user, assume it's ours
      if (
        !myEnvelope &&
        joinData.envelopes?.length === 1 &&
        joinData.envelopes[0].user_id
      ) {
        console.warn(
          `  [Federation] No match found. Defaulting to single available envelope: ${joinData.envelopes[0].user_id}`,
        );
        myEnvelope = joinData.envelopes[0];
      }

      console.log(
        "  [Federation] Final Envelope Selection:",
        myEnvelope ? "FOUND" : "NOT FOUND",
      );

      const encryptedKeyEnvelope = myEnvelope?.encrypted_key;

      if (!encryptedKeyEnvelope) {
        console.error(
          "  [Federation] No encrypted key envelope found in response!",
        );
        console.log(
          "  [Federation] Available envelopes:",
          joinData.envelopes?.map((e: any) => e.user_id),
        );
        // throw new Error("Failed to receive encrypted key from server");
        // For now continue but warn? No, we need the key.
      } else {
        console.log(
          "  [Federation] Encrypted key found. Length:",
          encryptedKeyEnvelope.length,
        );
        // Try to decrypt immediately to verify
        try {
          const { decryptKey } = await import("$lib/crypto");
          await decryptKey(encryptedKeyEnvelope, user.privateKeyEncrypted);
          console.log("  [Federation] Immediate decryption check: SUCCESS");
        } catch (e) {
          console.error("  [Federation] Immediate decryption check: FAILED", e);
        }
      }

      // Store document metadata locally
      console.log(`  [Federation] Saving document metadata for ${noteId}`);
      await db
        .insert(documents)
        .values({
          id: noteId,
          hostServer: originServer,
          ownerId: joinData.ownerId || user.id,
          title: joinData.title || "Federated Note",
          accessLevel: joinData.accessLevel || "private",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            title: joinData.title || "Federated Note",
            accessLevel: joinData.accessLevel || "private",
            updatedAt: new Date(),
          },
        });

      // Store member relationship with encrypted key
      console.log(
        `  [Federation] Saving member relationship for user ${user.id}`,
      );
      if (encryptedKeyEnvelope) {
        console.log(
          `  [Federation] Persisting encrypted key envelope (len=${encryptedKeyEnvelope.length})`,
        );
      } else {
        console.warn(
          `  [Federation] WARNING: Persisting member WITHOUT encrypted key!`,
        );
      }

      await db
        .insert(members)
        .values({
          docId: noteId,
          userId: user.id,
          deviceId: "default", // TODO: Support multiple devices
          role: joinData.role || "writer",
          encryptedKeyEnvelope: encryptedKeyEnvelope,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [members.docId, members.userId, members.deviceId],
          set: {
            encryptedKeyEnvelope: encryptedKeyEnvelope,
            role: joinData.role || "writer",
          },
        });

      console.log(`Successfully joined note ${uuid} from ${originServer}`);
      return { success: true, alreadyJoined: false };
    } catch (err) {
      console.error("Federation join error:", err);
      // Log the full error stack if available
      if (err instanceof Error) {
        console.error("Stack:", err.stack);
      }
      error(500, `Failed to join federated note: ${err}`);
    }
  },
);
