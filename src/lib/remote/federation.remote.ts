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

interface JoinRequest {
  noteId: string;
  originServer: string;
}

export const joinFederatedNote = command(
  async ({ noteId, originServer }: JoinRequest) => {
    const { user } = requireLogin();
    const currentDomain = env.SERVER_DOMAIN || "localhost:5173";
    const { uuid } = parseNoteId(noteId);

    try {
      // Check if already joined
      const existing = await db.query.documents.findFirst({
        where: eq(documents.id, uuid),
      });

      if (existing) {
        console.log(`Already joined note ${uuid}`);
        return { success: true, alreadyJoined: true };
      }

      // Call origin server's join endpoint
      const joinUrl = `http://${originServer}/federation/doc/${uuid}/join`;
      console.log(`Joining federated note from ${originServer}: ${joinUrl}`);

      // Get server identity for signing
      const serverIdentity = await getServerIdentity();
      const timestamp = Date.now().toString();
      const requestBody = {
        requesting_server: currentDomain,
        users: [user.id],
      };

      // Create signature
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
        console.error(
          `Federation join failed: ${response.status} ${errorText}`,
        );
        console.error("Full error:", errorText);
        error(response.status, `Failed to join note: ${errorText}`);
      }

      const joinData = await response.json();

      // Store document metadata locally
      await db.insert(documents).values({
        id: uuid,
        hostServer: originServer,
        ownerId: joinData.ownerId || user.id,
        title: joinData.title || "Federated Note",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Store member relationship with encrypted key
      await db.insert(members).values({
        docId: uuid,
        userId: user.id,
        deviceId: "default", // TODO: Support multiple devices
        role: joinData.role || "writer",
        encryptedKeyEnvelope: joinData.encryptedKey,
        createdAt: new Date(),
      });

      console.log(`Successfully joined note ${uuid} from ${originServer}`);
      return { success: true, alreadyJoined: false };
    } catch (err) {
      console.error("Federation join error:", err);
      error(500, `Failed to join federated note: ${err}`);
    }
  },
);
