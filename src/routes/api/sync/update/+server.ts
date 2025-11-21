import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { broadcast } from "$lib/server/realTime";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { noteId, update } = await request.json();

    if (!noteId || !update) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify access
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note || note.ownerId !== locals.user.id) {
      return json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    // Broadcast update to all connected clients
    // The update is expected to be a base64 string of the binary update
    broadcast(noteId, JSON.stringify({ update }));

    return json({ success: true });
  } catch (error) {
    console.error("Sync update error:", error);
    return json({ error: "Failed to process update" }, { status: 500 });
  }
};
