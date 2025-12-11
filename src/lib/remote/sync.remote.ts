import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db/index.ts";
import { notes } from "$lib/server/db/schema.ts";
import { broadcast } from "$lib/server/real-time.ts";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { Schema } from "effect";
import { syncSchema, syncSchemaJson } from "./notes.schemas.ts";

export const sync = command(syncSchema, async ({ noteId, update }) => {
  const { locals } = getRequestEvent();
  const user = locals.user;

  if (!user) error(401, "Unauthorized");

  try {
    // Verify access
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note || note.ownerId !== user.id) error(404, "Not found");

    console.log("Syncing", noteId);

    // Broadcast update to all connected clients
    // The update is expected to be a base64 string of the binary update
    broadcast(noteId, Schema.encodeSync(syncSchemaJson)({ noteId, update }));
  } catch (err) {
    console.error("Sync update error:", err);
    error(500, "Failed to process update");
  }
});
