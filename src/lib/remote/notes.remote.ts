import { command, query } from "$app/server";
import type { NoteOrFolder } from "$lib/schema.ts";
import { requireLogin } from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import { notes, documents, members } from "$lib/server/db/schema.ts";
import { error } from "@sveltejs/kit";
import { and, eq, ne } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { createNoteId } from "$lib/noteId.ts";
import {
  createNoteSchema,
  deleteNoteSchema,
  reorderNotesSchema,
  updateNoteSchema,
} from "./notes.schemas.ts";

export const getNotes = query(async (): Promise<NoteOrFolder[]> => {
  const { user } = requireLogin();

  // 1. Get owned notes from 'notes' table
  const userNotes = await db.query.notes.findMany({
    where: (notes) => eq(notes.ownerId, user.id),
  });

  const notesList: NoteOrFolder[] = userNotes.map(
    (n) =>
      ({
        ...n,
        content: "",
        order: n.order,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }) satisfies NoteOrFolder,
  );

  // 2. Get shared/federated notes where user is a member
  // These are stored in 'documents' table and linked via 'members'
  // We need to join them.
  // Query members where userId = user.id
  const memberships = await db.query.members.findMany({
    where: (members) => eq(members.userId, user.id),
    with: {
      document: true,
    },
  });

  // Filter out any that might overlap with owned notes (though normally shouldn't)
  // And map to NoteOrFolder
  for (const m of memberships) {
    if (!m.document) continue;

    // Check if already in list (owned notes might be in members too?)
    if (notesList.some((n) => n.id === m.document.id)) continue;

    // Map to NoteOrFolder structure
    // We treat them as root-level notes for now (parentId: null)
    // We get encryptedKey from the member envelope
    // We get encryptedKey from the member envelope
    if (m.encryptedKeyEnvelope) {
      let documentKey = m.encryptedKeyEnvelope;

      // If it's a shared note, the key in the envelope is encrypted for this user.
      // We must decrypt it so the client (Loro) gets the raw key (32 bytes).
      if (m.encryptedKeyEnvelope.length > 44) {
        // Basic check: 32 bytes base64 is ~44 chars. Envelope is much larger.
        try {
          const { decryptKey } = await import("$lib/crypto");
          // Note: user.privateKeyEncrypted is used here.
          if (user.privateKeyEncrypted) {
            documentKey = decryptKey(
              m.encryptedKeyEnvelope,
              user.privateKeyEncrypted,
            );
          } else {
            console.error(
              `[getNotes] User ${user.id} has no private key to decrypt note ${m.document.id}`,
            );
            continue; // Cannot access note without key
          }
        } catch (e) {
          console.error(
            `[getNotes] Failed to decrypt key for note ${m.document.id}:`,
            e,
          );
          continue; // Skip notes we can't decrypt
        }
      } else {
        // Key is already short, assuming raw key.
      }

      notesList.push({
        id: m.document.id,
        title: m.document.title || "Shared Note",
        ownerId: m.document.ownerId,
        encryptedKey: documentKey,
        isFolder: false, // Default for shared docs
        order: 0,
        parentId: null,
        createdAt: m.document.createdAt,
        updatedAt: m.document.updatedAt,
        content: "",
        accessLevel: m.document.accessLevel,
        loroSnapshot: null, // Snapshots for federated notes handled separately?
      });
    }
  }

  return notesList;
});

export interface SharedNote {
  id: string;
  title: string;
  hostServer: string;
  ownerId: string;
  accessLevel: string;
}

export const getSharedNotes = query(async (): Promise<SharedNote[]> => {
  const { user } = requireLogin();

  // Get documents from remote servers (not local)
  const sharedDocs = await db.query.documents.findMany({
    where: (documents) => ne(documents.hostServer, "local"),
  });

  return sharedDocs.map((doc) => ({
    id: doc.id,
    title: doc.title || "Untitled",
    hostServer: doc.hostServer,
    ownerId: doc.ownerId,
    accessLevel: doc.accessLevel,
  }));
});

/** @todo Switch to form? */
export const createNote = command(
  createNoteSchema,
  async ({
    title,
    encryptedKey,
    parentId,
    isFolder,
  }): Promise<Omit<NoteOrFolder, "content">> => {
    const { user } = requireLogin();

    try {
      if (!title || !encryptedKey) {
        error(400, "Missing required fields");
      }

      const serverDomain = env.SERVER_DOMAIN || "localhost:5173";
      const id = createNoteId(serverDomain);

      // Dual-write to documents table to support federatedOps
      await db.insert(documents).values({
        id,
        hostServer: "local",
        ownerId: user.id,
        title: title,
        accessLevel: "private", // Default
        documentKeyEncrypted: null, // Local notes use encryptedKey in notes table for now? Or should we populate this?
        // Ideally we migrate to using documents entirely, but for now dual-write.
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(notes).values({
        id,
        title,
        ownerId: user.id,
        encryptedKey,
        loroSnapshot: null,
        parentId,
        isFolder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const note = await db.query.notes.findFirst({
        where: (notes) => eq(notes.id, id),
      });

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
      const note = await db.query.notes.findFirst({
        where: eq(notes.id, noteId),
      });

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
      const existingNote = await db.query.notes.findFirst({
        where: eq(notes.id, noteId),
      });

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

      const updated = await db.query.notes.findFirst({
        where: eq(notes.id, noteId),
      });

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
