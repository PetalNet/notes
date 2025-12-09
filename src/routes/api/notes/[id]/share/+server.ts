import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes, noteShares, members, documents } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { requireLogin } from "$lib/server/auth";
import { env } from "$env/dynamic/private";
import {
  fetchUserIdentity,
  encryptDocumentKeyForUser,
} from "$lib/server/federation";

/**
 * Share API endpoint
 *
 * POST: Update sharing settings for a note
 * GET: Get current sharing settings
 */

export interface ShareSettings {
  accessLevel: "private" | "invite_only" | "authenticated" | "open";
  invitedUsers?: string[]; // Federated handles like @user:domain.com
}

// GET current share settings
export async function GET({ params, locals }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    throw error(404, "Note not found");
  }

  if (note.ownerId !== user.id) {
    throw error(403, "Only the owner can view share settings");
  }

  // Get invited users for this note
  const shares = await db.query.noteShares.findMany({
    where: eq(noteShares.noteId, noteId),
  });

  return json({
    accessLevel: note.accessLevel || "private",
    invitedUsers: shares.map((s) => s.sharedWithUser),
  });
}

// POST update share settings
export async function POST({ params, request, locals }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  const body = await request.json();
  const { accessLevel, invitedUsers } = body as ShareSettings;

  // Validate access level
  if (
    !["private", "invite_only", "authenticated", "open"].includes(accessLevel)
  ) {
    throw error(400, "Invalid access level");
  }

  // Find the note
  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    throw error(404, "Note not found");
  }

  if (note.ownerId !== user.id) {
    throw error(403, "Only the owner can update share settings");
  }

  // Get the document key (encrypted for owner)
  const encryptedDocKey = note.documentKeyEncrypted || note.encryptedKey;
  const serverDomain = env["SERVER_DOMAIN"] || "localhost:5173";

  // Update note access level
  await db
    .update(notes)
    .set({
      accessLevel,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));

  // Track failed invites for response
  const failedInvites: string[] = [];
  const successfulInvites: string[] = [];

  // Handle invited users for invite_only mode
  if (
    accessLevel === "invite_only" &&
    invitedUsers &&
    invitedUsers.length > 0
  ) {
    // Clear existing shares (we'll re-add them)
    await db.delete(noteShares).where(eq(noteShares.noteId, noteId));

    // Add new shares with encrypted keys
    for (const userHandle of invitedUsers) {
      const shareId = crypto.randomUUID();
      let encryptedKey = "";

      // Try to fetch user's public key and encrypt document key
      try {
        const identity = await fetchUserIdentity(userHandle, serverDomain);
        if (identity) {
          const encrypted = encryptDocumentKeyForUser(
            encryptedDocKey,
            identity,
          );
          if (encrypted) {
            encryptedKey = encrypted;
            successfulInvites.push(userHandle);

            // Also add to members table for federation
            await db
              .insert(members)
              .values({
                docId: noteId,
                userId: identity.handle || userHandle,
                deviceId: "primary",
                role: "writer",
                encryptedKeyEnvelope: encryptedKey,
                createdAt: new Date(),
              })
              .onConflictDoNothing();
          } else {
            failedInvites.push(userHandle);
          }
        } else {
          // User not found - still add share, key will be generated on join
          failedInvites.push(userHandle);
        }
      } catch (err) {
        console.error(`Failed to encrypt key for ${userHandle}:`, err);
        failedInvites.push(userHandle);
      }

      // Always store the share record (even if key encryption failed)
      await db.insert(noteShares).values({
        id: shareId,
        noteId,
        sharedWithUser: userHandle,
        encryptedKey,
        permissions: "write",
        createdAt: new Date(),
      });
    }
  } else if (accessLevel !== "invite_only") {
    // Clear invited users if not in invite_only mode
    await db.delete(noteShares).where(eq(noteShares.noteId, noteId));
    await db.delete(members).where(eq(members.docId, noteId));
  }

  // Also update the documents table if it exists (for federation)
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, noteId),
  });

  if (doc) {
    await db
      .update(documents)
      .set({
        accessLevel,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, noteId));
  }

  return json({
    success: true,
    accessLevel,
    invitedUsers: invitedUsers || [],
    successfulInvites,
    failedInvites,
  });
}
