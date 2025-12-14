import { command, query } from "$app/server";
import type { NoteOrFolder } from "$lib/schema.ts";
import { requireLogin } from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import * as table from "$lib/server/db/schema.ts";
import { error } from "@sveltejs/kit";
import { and, count, eq } from "drizzle-orm";
import {
  createNoteSchema,
  deleteNoteSchema,
  getNoteSchema,
  reorderNotesSchema,
  updateNoteSchema,
} from "./notes.schemas.ts";
import * as logic from "./notes.ts";

export const getNote = query(
  getNoteSchema,
  async (id): Promise<NoteOrFolder> => {
    const note = await logic.getNote(id);

    if (!note) error(404, "Note not found!");

    return note;
  },
);

export const getNotes = query(async (): Promise<NoteOrFolder[]> => {
  const { user } = requireLogin();

  const userNotes = await db
    .select()
    .from(table.notes)
    .where(eq(table.notes.ownerId, user.id));

  return userNotes.map(
    (n) =>
      ({
        ...n,
        content: "", // Will be decrypted when selected
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

      await db.insert(table.notes).values({
        id,
        title,
        ownerId: user.id,
        encryptedKey,
        loroSnapshot: encryptedSnapshot,
        parentId,
        isFolder,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies typeof table.notes.$inferInsert);

      const [note] = await db
        .select()
        .from(table.notes)
        .where(eq(table.notes.id, id));

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
      const [note] = await db
        .select()
        .from(table.notes)
        .where(eq(table.notes.id, noteId));

      if (!note || note.ownerId !== user.id) error(404, "Not found");

      await db.delete(table.notes).where(eq(table.notes.id, noteId));
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
        .from(table.notes)
        .where(eq(table.notes.id, noteId));

      if (!existingNote || existingNote.ownerId !== user.id) {
        error(404, "Not found");
      }

      // Update note
      await db
        .update(table.notes)
        .set({
          loroSnapshot: loroSnapshot ?? existingNote.loroSnapshot,
          title: title ?? existingNote.title,
          parentId: parentId ?? existingNote.parentId,
          updatedAt: new Date(),
        })
        .where(eq(table.notes.id, noteId));

      const [updated] = await db
        .select()
        .from(table.notes)
        .where(eq(table.notes.id, noteId));

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
          .update(table.notes)
          .set({ order: newOrder, updatedAt: new Date() })
          .where(and(eq(table.notes.id, id), eq(table.notes.ownerId, user.id))),
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

export const randomNoteId = query(
  async (): Promise<
    | {
        id: string;
        title: string;
        updatedAt: Date;
      }
    | undefined
  > => {
    const { user } = requireLogin();

    const userNotes = await db
      .select({
        id: table.notes.id,
        title: table.notes.title,
        updatedAt: table.notes.updatedAt,
      })
      .from(table.notes)
      .where(
        and(eq(table.notes.ownerId, user.id), eq(table.notes.isFolder, false)),
      );

    if (userNotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * userNotes.length);
      return userNotes[randomIndex];
    }

    return undefined;
  },
);

export const getNoteCount = query(async (): Promise<number> => {
  const { user } = requireLogin();

  const [countResult] = await db
    .select({ count: count(table.notes.id) })
    .from(table.notes)
    .where(eq(table.notes.ownerId, user.id));

  return countResult?.count ?? 0;
});
