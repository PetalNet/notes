import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { count, sql } from "drizzle-orm";

export const load = async ({ locals }) => {
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
    .from(notes)
    .where(sql`${notes.ownerId} = ${user.id} AND ${notes.isFolder} = 0`);

  const totalNotes = totalNotesResult[0]?.count ?? 0;

  // Get a random note (excluding folders)
  let randomNote = null;
  if (totalNotes > 0) {
    const userNotes = await db.query.notes.findMany({
      where: (notes) =>
        sql`${notes.ownerId} = ${user.id} AND ${notes.isFolder} = 0`,
      columns: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

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
