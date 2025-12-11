/**
 * Utilities for creating and parsing domain-prefixed note IDs
 * Format: {base64url(origin)}~{uuid}
 */

/**
 * Create a new note ID with embedded origin domain
 */
export function createNoteId(serverDomain: string): string {
  const uuid = crypto.randomUUID();

  const domainB64 = Uint8Array.from(serverDomain, (c) =>
    c.charCodeAt(0),
  ).toBase64({ alphabet: "base64url", omitPadding: true });

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
  const sepIndex = id.indexOf("~");
  if (sepIndex === -1) throw new Error(`Invalid portable ID format: ${id}`);

  const domainB64 = id.slice(0, sepIndex);
  const uuid = id.slice(sepIndex + 1);

  if (!domainB64 || !uuid) throw new Error(`Malformed portable ID: ${id}`);

  // Decode base64url directly to string without intermediate array
  const origin = new TextDecoder().decode(
    Uint8Array.fromBase64(domainB64, { alphabet: "base64url" }),
  );

  return { origin, uuid, fullId: id };
}

/**
 * Check if a note ID is from the local server
 */
export function isLocalNote(noteId: string, currentDomain: string): boolean {
  try {
    const { origin } = parseNoteId(noteId);
    return !origin || origin === currentDomain;
  } catch {
    return false;
  }
}
