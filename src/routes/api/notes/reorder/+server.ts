import { json, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { and, eq } from "drizzle-orm";

// Batch reorder notes
export const POST = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, "Unauthorized");
  }

  const { updates } = (await request.json()) as {
    updates: Array<{ id: string; order: number }>;
  };

  if (!updates || !Array.isArray(updates)) {
    return error(400, "Invalid request body");
  }

  try {
    // Update all notes in a transaction-like manner
    // (SQLite doesn't support multiple updates in a single statement easily via Drizzle)
    for (const { id, order: newOrder } of updates) {
      // Verify the note belongs to the user
      const note = await db.query.notes.findFirst({
        where: (notes) =>
          and(eq(notes.id, id), eq(notes.ownerId, locals.user!.id)),
      });

      if (!note) {
        continue; // Skip notes that don't exist or don't belong to user
      }

      await db
        .update(notes)
        .set({ order: newOrder, updatedAt: new Date() })
        .where(eq(notes.id, id));
    }

    return json({ success: true });
  } catch (err) {
    console.error("Reorder error:", err);
    return error(500, "Failed to reorder notes");
  }
};
