import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes, noteShares, members, documents } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { requireLogin } from "$lib/server/auth";

/**
 * Leave API endpoint
 *
 * POST: Leave a note (remove self as member)
 */

export async function POST({ params, locals }) {
  const { user } = requireLogin();
  const { id: noteId } = params;

  // Find the note
  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note) {
    throw error(404, "Note not found");
  }

  // Can't leave if you're the owner
  if (note.ownerId === user.id) {
    throw error(
      400,
      "Owner cannot leave their own note. Transfer ownership or delete the note instead.",
    );
  }

  // Remove self from noteShares
  await db
    .delete(noteShares)
    .where(
      and(
        eq(noteShares.noteId, noteId),
        eq(noteShares.sharedWithUser, user.id),
      ),
    );

  // Remove self from members table (federation)
  await db
    .delete(members)
    .where(and(eq(members.docId, noteId), eq(members.userId, user.id)));

  // Delete local copy of the note if it's a federated note we don't own
  // Check if this is a federated note by looking at the documents table
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, noteId),
  });

  if (doc && doc.hostServer !== "local") {
    // This is a federated note - delete our local copy
    await db.delete(notes).where(eq(notes.id, noteId));
    await db.delete(documents).where(eq(documents.id, noteId));
  }

  return json({ success: true, leftNoteId: noteId });
}
