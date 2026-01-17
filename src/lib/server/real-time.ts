// In-memory map of noteId to set of controller objects for SSE
// Using ReadableStreamDefaultController for SvelteKit's custom stream response
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

export function addClient(
  noteId: string,
  controller: ReadableStreamDefaultController,
): void {
  if (!clients.has(noteId)) {
    clients.set(noteId, new Set());
  }
  const client = clients.get(noteId);
  client?.add(controller);

  console.debug(
    `Client added to note ${noteId}. Total clients: ${(client?.size ?? 0).toFixed()}`,
  );
}

export function removeClient(
  noteId: string,
  controller: ReadableStreamDefaultController,
): void {
  const set = clients.get(noteId);
  if (set) {
    set.delete(controller);
    if (set.size === 0) {
      clients.delete(noteId);
    }
    console.debug(
      `Client removed from note ${noteId}. Remaining: ${set.size.toFixed()}`,
    );
  }
}

export function broadcast(
  noteId: string,
  data: string,
  senderController?: ReadableStreamDefaultController,
): void {
  const set = clients.get(noteId);
  if (!set) return;

  const payload = `data: ${data}\n\n`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);

  for (const controller of set) {
    // Don't send back to sender if specified (though usually we want to confirm receipt or just rely on local application)
    // For Loro, we usually apply local updates immediately, so we might skip sending back to sender.
    // However, the sender is identified by the connection, so we can filter.
    if (senderController && controller === senderController) continue;

    try {
      controller.enqueue(bytes);
    } catch (e) {
      console.error(`Failed to send to client for note ${noteId}`, e);
      removeClient(noteId, controller);
    }
  }
}
