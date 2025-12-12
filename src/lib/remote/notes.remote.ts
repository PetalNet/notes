import { command, query } from "$app/server";
import type { NoteOrFolder } from "$lib/schema.ts";
import { requireLogin } from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import { notes } from "$lib/server/db/schema.ts";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import {
  createNoteSchema,
  deleteNoteSchema,
  reorderNotesSchema,
  updateNoteSchema,
} from "./notes.schemas.ts";

export const getNotes = query(async (): Promise<NoteOrFolder[]> => {
  const { user } = requireLogin();

  const userNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.ownerId, user.id));

  return userNotes.map(
    (n) =>
      ({
        ...n,
        content: "", // Will be decrypted when selected
        order: n.order,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }) satisfies NoteOrFolder,
  );
});

/** @todo Switch to form? */
export const createNote = command(
  createNoteSchema,
  async ({
    title,
    encryptedKey,
    parentId,
    isFolder,
    encryptedSnapshot,
  }): Promise<Omit<NoteOrFolder, "content">> => {
    const { user } = requireLogin();

    try {
      const id = crypto.randomUUID();

      await db.insert(notes).values({
        id,
        title,
        ownerId: user.id,
        encryptedKey,
        loroSnapshot: encryptedSnapshot,
        parentId,
        isFolder,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies typeof notes.$inferInsert);

      const [note] = await db.select().from(notes).where(eq(notes.id, id));

      if (!note) throw new Error("Failed to find newly created note!");

      return note;
    } catch (err) {
      console.error("Create note error:", err);
      return error(500, "Failed to create note");
    }
  },
);

/** @todo Switch to form? */
export const deleteNote = command(
  deleteNoteSchema,
  async (noteId): Promise<void> => {
    const { user } = requireLogin();

    try {
      // Verify ownership
      const [note] = await db.select().from(notes).where(eq(notes.id, noteId));

      if (!note || note.ownerId !== user.id) error(404, "Not found");

      await db.delete(notes).where(eq(notes.id, noteId));
    } catch (err) {
      console.error("Delete note error:", err);
      error(500, "Failed to delete note");
    }
  },
);

export const updateNote = command(
  updateNoteSchema,
  async ({
    noteId,
    title,
    loroSnapshot,
    parentId,
  }): Promise<Omit<NoteOrFolder, "content">> => {
    const { user } = requireLogin();

    try {
      // Verify ownership
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId));

      if (!existingNote || existingNote.ownerId !== user.id) {
        error(404, "Not found");
      }

      // Update note
      await db
        .update(notes)
        .set({
          loroSnapshot: loroSnapshot ?? existingNote.loroSnapshot,
          title: title ?? existingNote.title,
          parentId: parentId ?? existingNote.parentId,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId));

      const [updated] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId));

      if (!updated) throw new Error("Failed to find newly created note!");

      return updated;
    } catch (err) {
      console.error("[API] Update error:", err);
      error(500, "Failed to update note");
    }
  },
);

function isTuple<T>(array: T[]): array is [T, ...T[]] {
  return array.length > 0;
}

export const reorderNotes = command(
  reorderNotesSchema,
  async (updates): Promise<void> => {
    const { user } = requireLogin();

    try {
      const updateStatements = updates.map(({ id, order: newOrder }) =>
        db
          .update(notes)
          .set({ order: newOrder, updatedAt: new Date() })
          .where(and(eq(notes.id, id), eq(notes.ownerId, user.id))),
      );

      // If no notes exist, do nothing.
      if (!isTuple(updateStatements)) return;

      await db.batch(updateStatements);
    } catch (err) {
      console.error("Reorder error:", err);
      error(500, "Failed to reorder notes");
    }
  },
);
