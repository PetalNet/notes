import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes, noteShares, members } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { requireLogin } from "$lib/server/auth";

/**
 * Members API endpoint
 *
 * GET: Get list of members for a note
 * POST: Add a member to the note (owner only)
 * DELETE: Remove a member from the note (owner only)
 */

export interface Member {
  userId: string; // Federated handle or local user ID
  role: string; // owner, writer, reader
  addedAt?: string; // When they were added
}

// GET members list
export async function GET({ params }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    error(404, "Note not found");
  }

  // Check if user has access (owner or member)
  const isOwner = note.ownerId === user.id;

  // Get shares from noteShares table (for invite_only mode)
  const shares = await db.query.noteShares.findMany({
    where: eq(noteShares.noteId, noteId),
  });

  // Get members from members table (for federation)
  const membersList = await db.query.members.findMany({
    where: eq(members.docId, noteId),
  });

  // Build combined member list
  const result: Member[] = [];

  // Add owner first
  result.push({
    userId: note.ownerId,
    role: "owner",
  });

  // Add invited users from noteShares
  for (const share of shares) {
    if (share.sharedWithUser !== note.ownerId) {
      result.push({
        userId: share.sharedWithUser,
        role: share.permissions === "write" ? "writer" : "reader",
        addedAt: share.createdAt.toISOString(),
      });
    }
  }

  // Add federated members
  for (const member of membersList) {
    // Avoid duplicates
    if (!result.find((m) => m.userId === member.userId)) {
      result.push({
        userId: member.userId,
        role: member.role,
        addedAt: member.createdAt.toISOString(),
      });
    }
  }

  return json({
    noteId,
    isOwner,
    accessLevel: note.accessLevel,
    members: result,
  });
}

// POST add member
export async function POST({ params, request }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  const body = await request.json();
  const { userId, role = "writer" } = body;

  if (!userId) {
    error(400, "userId is required");
  }

  // Find the note and verify ownership
  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    error(404, "Note not found");
  }

  if (note.ownerId !== user.id) {
    error(403, "Only the owner can add members");
  }

  // Add to noteShares for invite_only mode
  const shareId = crypto.randomUUID();
  await db
    .insert(noteShares)
    .values({
      id: shareId,
      noteId,
      sharedWithUser: userId,
      encryptedKey: "", // Will be populated when they request access
      permissions: role === "reader" ? "read" : "write",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  // If invite_only mode is not set, set it
  if (note.accessLevel === "private") {
    await db
      .update(notes)
      .set({ accessLevel: "invite_only", updatedAt: new Date() })
      .where(eq(notes.id, noteId));
  }

  return json({ success: true, userId, role });
}

// DELETE remove member
export async function DELETE({ params, request }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    error(400, "userId query parameter is required");
  }

  // Find the note and verify ownership
  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    error(404, "Note not found");
  }

  if (note.ownerId !== user.id) {
    error(403, "Only the owner can remove members");
  }

  if (userId === note.ownerId) {
    error(400, "Cannot remove the owner");
  }

  // Remove from noteShares
  await db
    .delete(noteShares)
    .where(
      and(eq(noteShares.noteId, noteId), eq(noteShares.sharedWithUser, userId)),
    );

  // Remove from members table (federation)
  await db
    .delete(members)
    .where(and(eq(members.docId, noteId), eq(members.userId, userId)));

  return json({ success: true, removedUserId: userId });
}
