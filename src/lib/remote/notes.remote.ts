import { query, getRequestEvent } from "$app/server";
import type { NoteOrFolder } from "$lib/schema.ts";
import { db } from "$lib/server/db/index.ts";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

export const getNotes = query(async (): Promise<NoteOrFolder[]> => {
  const { locals } = getRequestEvent();
  const user = locals.user;

  if (!user) {
    error(401, "Unauthorized");
  }

  const userNotes = await db.query.notes.findMany({
    where: (notes) => eq(notes.ownerId, user.id),
  });

  return userNotes.map(
    (n) =>
      ({
        ...n,
        content: "", // Will be decrypted when selected
        order: n.order,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }) as NoteOrFolder,
  );
});
