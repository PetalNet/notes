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
    // Legacy format - assume local
    return { origin: "", uuid: id, fullId: id };
  }

  const [domainB64, uuid] = id.split("~");
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
