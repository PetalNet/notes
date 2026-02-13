import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db/index.ts";
import * as table from "$lib/server/db/schema.ts";
import { broadcast } from "$lib/server/real-time.ts";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { Schema } from "effect";
import { syncSchema, syncSchemaJson } from "./notes.schemas.ts";

export const sync = command(syncSchema, async ({ noteId, updates }) => {
  const {
    locals: { user },
  } = getRequestEvent();

  if (!user) error(401, "Unauthorized");

  try {
    // Verify access
    const note = await db
      .select()
      .from(table.notes)
      .where(eq(table.notes.id, noteId))
      .get();

    if (!note || note.ownerId !== user.id) error(404, "Not found");

    console.debug("Syncing", noteId);

    // Broadcast update to all connected clients
    // The update is expected to be a base64 string of the binary update
    broadcast(noteId, Schema.encodeSync(syncSchemaJson)({ noteId, updates }));
  } catch (err) {
    console.error("Sync update error:", err);
    error(500, "Failed to process update");
  }
});
