import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, count, eq } from "drizzle-orm";

// TODO: Make this a remote function instead.
interface Data {
  totalNotes: number;
  randomNote:
    | {
        id: string;
        title: string;
        updatedAt: Date;
      }
    | null
    | undefined;
}

export const load = async ({ locals }): Promise<Data> => {
  const user = locals.user;

  if (!user) {
    return {
      totalNotes: 0,
      randomNote: null,
    };
  }

  // Get total notes count (excluding folders)
  const totalNotesResult = await db
    .select({ count: count() })
    .from(table.notes)
    .where(
      and(eq(table.notes.ownerId, user.id), eq(table.notes.isFolder, false)),
    );

  const totalNotes = totalNotesResult[0]?.count ?? 0;

  // Get a random note (excluding folders)
  let randomNote = null;
  if (totalNotes > 0) {
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
      randomNote = userNotes[randomIndex];
    }
  }

  return {
    totalNotes,
    randomNote,
  };
};
