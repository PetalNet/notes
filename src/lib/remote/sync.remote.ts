import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db/index.ts";
import { notes } from "$lib/server/db/schema.ts";
import { broadcast } from "$lib/server/real-time.ts";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { syncSchema } from "./notes.schemas.ts";

export const sync = command(syncSchema, async ({ noteId, updates }) => {
  const { locals } = getRequestEvent();
  const user = locals.user;

  if (!user) error(401, "Unauthorized");

  try {
    // Verify access
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note || note.ownerId !== user.id) error(404, "Not found");

    // Broadcast update to all connected clients
    // The update is expected to be a base64 string of the binary update
    broadcast(noteId, JSON.stringify({ updates }));
  } catch (err) {
    console.error("Sync update error:", err);
    error(500, "Failed to process update");
  }
});
