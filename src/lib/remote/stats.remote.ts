import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, count, eq } from "drizzle-orm";

import { getRequestEvent, query } from "$app/server";

interface Note {
  id: string;
  title: string;
  updatedAt: Date;
}

interface Stats {
  totalNotes: number;
  randomNote: Note | undefined;
}

export const getStats = query(async (): Promise<Stats> => {
  const {
    locals: { user },
  } = getRequestEvent();

  if (!user) {
    return {
      totalNotes: 0,
      randomNote: undefined,
    };
  }

  // Get total notes count (excluding folders)
  const [totalNotesResult] = await db
    .select({ count: count() })
    .from(table.notes)
    .where(
      and(eq(table.notes.ownerId, user.id), eq(table.notes.isFolder, false)),
    );

  const totalNotes = totalNotesResult?.count ?? 0;

  // Get a random note (excluding folders)
  let randomNote: Note | undefined;
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
});
