import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export const POST = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, encryptedKey, parentId, isFolder } = await request.json();

    if (!title || !encryptedKey) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(notes).values({
      id,
      title,
      ownerId: locals.user.id,
      encryptedKey,
      loroSnapshot: null,
      parentId: parentId || null,
      isFolder: isFolder || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const note = await db.query.notes.findFirst({
      where: (notes) => eq(notes.id, id),
    });

    return json({ note });
  } catch (error) {
    console.error("Create note error:", error);
    return json({ error: "Failed to create note" }, { status: 500 });
  }
};
