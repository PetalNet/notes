import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db/index.ts";
import { documents, members } from "$lib/server/db/schema.ts";
import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { parseNoteId } from "$lib/noteId.ts";
import { getServerIdentity } from "$lib/server/identity.ts";
import { encryptKeyForUser, sign } from "$lib/crypto.ts";
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

    const event = getRequestEvent();
    const user = event.locals.user;

    try {
      const currentDomain = env["SERVER_DOMAIN"] ?? "localhost:5173";
      const { uuid } = parseNoteId(noteId);

      // Skip DB check if no user
      if (user) {
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

          existingDoc ??= await db.query.documents.findFirst({
            where: eq(documents.id, uuid),
            with: { members: { where: (m) => eq(m.userId, user.id) } },
          });

          const memberEntry = existingDoc?.members[0];
          const hasKey = !!memberEntry?.encryptedKeyEnvelope;

          if (existingDoc && hasKey) {
            console.log(`Already joined note ${noteId} (Key found)`);
            return { success: true, alreadyJoined: true };
          }
        } catch (e) {
          console.error("DB check failed", e);
        }
      }

      // Call origin server's join endpoint
      const joinUrl = `http://${originServer}/federation/doc/${encodeURIComponent(noteId)}/join`;

      // Get server identity for signing
      const serverIdentity = await getServerIdentity();
      const timestamp = Date.now().toString();
      const userHandle = user
        ? `@${user.username}:${currentDomain}`
        : `@anonymous:${currentDomain}`;

      const requestBody = {
        requesting_server: currentDomain,
        users: user ? [userHandle] : [], // Send empty user list if anonymous
      };

      const message = `${currentDomain}:${timestamp}:${JSON.stringify(requestBody)}`;
      const signature = sign(
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

          if (user?.publicKey) {
            encryptedKeyEnvelope = encryptKeyForUser(
              joinData.rawKey,
              user.publicKey,
            );
          } else {
            // Anonymous: We don't need an envelope because we don't save to DB.
            // But we might want to return the rawKey directly in the response (handled by ...joinData)
            console.log(
              "  [Federation] Anonymous user: Skipping envelope creation.",
            );
          }
        } else {
          // Normal E2EE Envelope Logic
          let myEnvelope = joinData.envelopes?.find(
            (e: any) =>
              (user && e.user_id === userHandle) ??
              (user && e.user_id === user.id) ??
              (user && e.user_id === `@${user.username}`) ??
              (user && e.user_id === user.username),
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

      // If logged in, we expect an envelope/key to save
      if (user) {
        if (!encryptedKeyEnvelope) {
          console.error("  [Federation] No encrypted key envelope found!");
        }

        // Store document metadata locally
        await db
          .insert(documents)
          .values({
            id: noteId,
            hostServer: originServer,
            ownerId: joinData.ownerId ?? user.id,
            title: joinData.title ?? "Federated Note",
            accessLevel: joinData.accessLevel ?? "private",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: documents.id,
            set: {
              title: joinData.title ?? "Federated Note",
              accessLevel: joinData.accessLevel ?? "private",
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
            role: joinData.role ?? "writer",
            encryptedKeyEnvelope: encryptedKeyEnvelope,
            createdAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [members.docId, members.userId, members.deviceId],
            set: {
              encryptedKeyEnvelope: encryptedKeyEnvelope,
              role: joinData.role ?? "writer",
            },
          });
      }

      console.log(`Successfully joined note ${uuid} from ${originServer}`);
      return { success: true, alreadyJoined: false, ...joinData };
    } catch (err) {
      console.error("Federation join error:", err);
      if (err instanceof Error) {
        console.error("Stack:", err.stack);
      }
      error(500, `Failed to join federated note: ${err}`);
    }
  },
);
