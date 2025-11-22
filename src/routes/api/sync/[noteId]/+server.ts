import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { notes } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { addClient, removeClient } from "$lib/server/real-time";

export const GET = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const noteId = params.noteId;
  if (!noteId) {
    return json({ error: "Note ID required" }, { status: 400 });
  }

  // Verify access
  const note = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!note || note.ownerId !== locals.user.id) {
    // TODO: Add check for shared notes when federation via ATProto is implemented
    return json({ error: "Not found or unauthorized" }, { status: 404 });
  }

  // Create a stream for SSE
  let controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(c) {
      controller = c;
      addClient(noteId, controller);
      // Send initial connection message
      const encoder = new TextEncoder();
      c.enqueue(
        encoder.encode('event: connected\ndata: {"status":"connected"}\n\n'),
      );
    },
    cancel() {
      removeClient(noteId, controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
