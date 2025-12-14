import type { NoteOrFolder } from "$lib/schema.ts";
import { requireLogin } from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import * as table from "$lib/server/db/schema.ts";
import { and, eq } from "drizzle-orm";

export async function getNote(id: string): Promise<NoteOrFolder | undefined> {
  const { user } = requireLogin();

  const note = await db
    .select()
    .from(table.notes)
    .where(and(eq(table.notes.id, id), eq(table.notes.ownerId, user.id)))
    .get();

  if (!note) return undefined;

  return { ...note, content: "" };
}
