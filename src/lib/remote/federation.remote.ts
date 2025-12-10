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
  preComputedKey: Schema.optional(Schema.String),
}).pipe(Schema.standardSchemaV1);

export const joinFederatedNote = command(
  joinFederatedNoteSchema,
  async ({ noteId, originServer, preComputedKey }) => {
    console.log("=== FEDERATION JOIN START ===");
    console.log("  noteId:", noteId);
    console.log("  originServer:", originServer);

    const { user } = requireLogin();
    // ... (rest of setup)

    const currentDomain = env["SERVER_DOMAIN"] || "localhost:5173";
    const { uuid, origin } = parseNoteId(noteId);

    try {
      // Check if already joined (check both full ID and uuid)
      let existingDoc = await db.query.documents.findFirst({
        where: eq(documents.id, noteId),
        with: {
          members: {
            where: (members) => eq(members.userId, user.id),
          },
        },
      });

      if (!existingDoc) {
        existingDoc = await db.query.documents.findFirst({
          where: eq(documents.id, uuid),
          with: { members: { where: (m) => eq(m.userId, user.id) } },
        });
      }

      const memberEntry = existingDoc?.members[0];
      const hasKey = !!memberEntry?.encryptedKeyEnvelope;

      if (existingDoc && hasKey) {
        console.log(`Already joined note ${noteId} (Key found)`);
        return { success: true, alreadyJoined: true };
      }

      // If we have a pre-computed key, use it directly without re-fetching signatures/remote if possible.
      // But we still need to fetch remote to verify metadata if not exists?
      // Actually, if we have preComputedKey, we assume the Client did the verification?
      // No, Client only got the key from a previous failed attempt. We still need to create `documents` and `members` entries properly.
      // So we PROCEED, but use `preComputedKey` instead of parsing envelopes.

      // Call origin server's join endpoint
      const joinUrl = `http://${originServer}/federation/doc/${encodeURIComponent(noteId)}/join`;

      // Get server identity for signing
      const serverIdentity = await getServerIdentity();
      const timestamp = Date.now().toString();
      const userHandle = `@${user.username}:${currentDomain}`;

      const requestBody = {
        requesting_server: currentDomain,
        users: [userHandle],
      };

      const message = `${currentDomain}:${timestamp}:${JSON.stringify(requestBody)}`;
      const signature = await sign(
        new TextEncoder().encode(message),
        serverIdentity.privateKey,
      );

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

      if (!response.ok) {
        const errorText = await response.text();
        error(response.status, `Failed to join note: ${errorText}`);
      }

      const joinData = await response.json();

      // Handle Password Protection
      // If server returned a passwordEncryptedKey AND we don't have a preComputedKey provided yet:
      if (joinData.passwordEncryptedKey && !preComputedKey) {
        console.log(
          "  [Federation] Note is password protected. Client must unlock.",
        );
        return {
          success: false,
          status: "needs_password",
          passwordEncryptedKey: joinData.passwordEncryptedKey,
        };
      }

      let encryptedKeyEnvelope: string | undefined;

      if (preComputedKey) {
        console.log(
          "  [Federation] Using pre-computed key envelope provided by client.",
        );
        encryptedKeyEnvelope = preComputedKey;
      } else {
        // Robust envelope finding (User Envelope or Public Raw Key)
        // Check for RAW KEY first (Open Public)
        if (joinData.rawKey) {
          console.log("  [Federation] Note is Open Public. Using Raw Key.");
          // We need to ENCRYPT this raw key for the user, so it matches the expectation of 'encryptedKeyEnvelope'
          // User expects: decrypt(envelope, userPrivateKey) -> rawKey
          // So envelope = encrypt(rawKey, userPublicKey)
          // But we are on Server. We don't have user's raw private key, but we have user's Public Key?
          // Wait, server has user.publicKey (Ed25519) in `users` table, but we need encryption key?
          // If user is local, `users` table has `publicKey`.
          // Actually, `encryptKeyForUser` logic.
          // Let's use `encryptKeyForUser` helper.
          const { encryptKeyForUser } = await import("$lib/crypto");
          // Note: This assumes `user.publicKey` is suitable for encryption or we derive it.
          if (user.publicKey) {
            encryptedKeyEnvelope = await encryptKeyForUser(
              joinData.rawKey,
              user.publicKey,
            );
          } else {
            // Fallback: store raw key? Leaky?
            // No, we must encrypt.
            console.error(
              "  [Federation] Cannot encrypt public key: User has no Public Key.",
            );
          }
        } else {
          // Normal E2EE Envelope Logic
          let myEnvelope = joinData.envelopes?.find(
            (e: any) =>
              e.user_id === userHandle ||
              e.user_id === user.id ||
              e.user_id === `@${user.username}` ||
              e.user_id === user.username,
          );

          if (
            !myEnvelope &&
            joinData.envelopes?.length === 1 &&
            joinData.envelopes[0].user_id
          ) {
            myEnvelope = joinData.envelopes[0];
          }

          encryptedKeyEnvelope = myEnvelope?.encrypted_key;
        }
      }

      if (!encryptedKeyEnvelope) {
        console.error("  [Federation] No encrypted key envelope found!");
        // Continue but without key? No, fatal for join.
        // Unless it is a metadata-only join?
      }

      // Store document metadata locally
      // ... (existing db insert logic)
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

      // Store member relationship
      await db
        .insert(members)
        .values({
          docId: noteId,
          userId: user.id,
          deviceId: "default",
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
      if (err instanceof Error) {
        console.error("Stack:", err.stack);
      }
      error(500, `Failed to join federated note: ${err}`);
    }
  },
);
