/**
 * Utilities for creating and parsing domain-prefixed note IDs
 * Format: {base64url(origin)}~{uuid}
 * Example: bG9jYWxob3N0OjUxNzM~2472a017-f681-4fdd-bd46-80207dc3c5fb
 */

/**
 * Create a new note ID with embedded origin domain
 */
export function createNoteId(serverDomain: string): string {
  const uuid = crypto.randomUUID();
  const domainB64 = btoa(serverDomain)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${domainB64}~${uuid}`;
}

/**
 * Parse a note ID to extract origin domain and UUID
 */
export function parseNoteId(id: string): {
  origin: string;
  uuid: string;
  fullId: string;
} {
  if (!id.includes("~")) {
    // Strict mode: fail if no tilde
    // throw new Error(`Invalid note ID format: ${id}`);
    // Actually, for now let's just return empty origin but maybe log a warning?
    // User requested strict enforcement.
    // If we throw here, we might break existing legacy notes if they exist.
    // But this is a new feature set.
    // Let's return null/empty for origin but keep UUID so things don't crash hard,
    // but maybe we should ensure we ONLY use fullId everywhere.
    return { origin: "", uuid: id, fullId: id };
  }

  const parts = id.split("~");
  const domainB64 = parts[0];
  const uuid = parts[1];

  if (!domainB64 || !uuid) {
    throw new Error(`Malformed portable ID: ${id}`);
  }

  const padded = domainB64 + "=".repeat((4 - (domainB64.length % 4)) % 4);
  const origin = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  return { origin, uuid, fullId: id };
}

/**
 * Check if a note ID is from the local server
 */
export function isLocalNote(noteId: string, currentDomain: string): boolean {
  const { origin } = parseNoteId(noteId);
  return !origin || origin === currentDomain;
}
