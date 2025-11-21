import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, loroSnapshot, parentId } = await request.json();

  try {
    const noteId = params.id;

    // Verify ownership
    const existingNote = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!existingNote || existingNote.ownerId !== locals.user.id) {
      return json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    // Update note
    await db
      .update(notes)
      .set({
        loroSnapshot:
          loroSnapshot !== undefined ? loroSnapshot : existingNote.loroSnapshot,
        title: title !== undefined ? title : existingNote.title,
        parentId: parentId !== undefined ? parentId : existingNote.parentId,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId));

    const updated = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    return json({ note: updated });
  } catch (err) {
    console.error("[API] Update error:", err);
    return json({ error: "Failed to update note" }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const noteId = params.id;

    // Verify ownership
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note || note.ownerId !== locals.user.id) {
      return json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    await db.delete(notes).where(eq(notes.id, noteId));

    return json({ success: true });
  } catch (error) {
    console.error("Delete note error:", error);
    return json({ error: "Failed to delete note" }, { status: 500 });
  }
};
