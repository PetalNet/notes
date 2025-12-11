/**
 * Federation utilities for cross-server communication
 */

import { encryptKeyForDevice } from "$lib/crypto";

export interface RemoteUserIdentity {
  id: string;
  handle: string;
  publicKey: string | null;
  devices: {
    device_id: string;
    public_key: string;
  }[];
}

/**
 * Fetch a user's identity from their home server
 * @param handle - Federated handle like @alice:server.com or @bob
 * @param requestingDomain - Domain making the request (for relative handles)
 */
export async function fetchUserIdentity(
  handle: string,
  requestingDomain: string,
): Promise<RemoteUserIdentity | null> {
  // Parse handle to extract user and domain
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

  let username: string;
  let domain: string;

  if (cleanHandle.includes(":")) {
    // Federated handle: user:domain.com
    const parts = cleanHandle.split(":");
    username = parts[0] ?? "";
    domain = parts.slice(1).join(":"); // Handle domain:port
  } else {
    // Local handle or just username
    username = cleanHandle;
    domain = requestingDomain;
  }

  if (!username || !domain) {
    console.error("Invalid handle format:", handle);
    return null;
  }

  const protocol = domain.includes("localhost") ? "http" : "https";
  const identityUrl = `${protocol}://${domain}/.well-known/notes-identity/@${username}`;

  try {
    const res = await fetch(identityUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(
        `Failed to fetch identity for ${handle}: ${res.status.toFixed()}`,
      );
      return null;
    }

    const data = (await res.json()) as unknown as RemoteUserIdentity;
    return data;
  } catch (err) {
    console.error(`Error fetching identity for ${handle}:`, err);
    return null;
  }
}

/**
 * Encrypt a document key for a remote user
 * Uses the user's primary public key (or first device key if no user key)
 */
export async function encryptDocumentKeyForUser(
  documentKey: string,
  identity: RemoteUserIdentity,
): Promise<string | null> {
  // Prefer user's main public key, fallback to first device
  const publicKey = identity.publicKey ?? identity.devices[0]?.public_key;

  if (!publicKey) {
    console.error(`No public key found for user ${identity.handle}`);
    return null;
  }

  try {
    return await encryptKeyForDevice(documentKey, publicKey);
  } catch (err) {
    console.error(`Failed to encrypt key for ${identity.handle}:`, err);
    return null;
  }
}

/**
 * Generate encrypted key envelopes for multiple users
 */
export async function generateKeyEnvelopesForUsers(
  documentKey: string,
  userHandles: string[],
  requestingDomain: string,
): Promise<
  {
    user_id: string;
    encrypted_key: string;
    device_id: string;
  }[]
> {
  const envelopes: {
    user_id: string;
    encrypted_key: string;
    device_id: string;
  }[] = [];

  for (const handle of userHandles) {
    const identity = await fetchUserIdentity(handle, requestingDomain);
    if (!identity) {
      console.warn(`Skipping ${handle} - could not fetch identity`);
      continue;
    }

    // Generate envelope for user's main key
    if (identity.publicKey) {
      const encryptedKey = await encryptDocumentKeyForUser(
        documentKey,
        identity,
      );
      if (encryptedKey) {
        envelopes.push({
          user_id: identity.handle,
          encrypted_key: encryptedKey,
          device_id: "primary", // Main user key, not device-specific
        });
      }
    }

    // Optionally generate envelopes for each device
    for (const device of identity.devices) {
      try {
        const encryptedKey = await encryptKeyForDevice(
          documentKey,
          device.public_key,
        );
        envelopes.push({
          user_id: identity.handle,
          encrypted_key: encryptedKey,
          device_id: device.device_id,
        });
      } catch (err) {
        console.error(`Failed to encrypt for device ${device.device_id}:`, err);
      }
    }
  }

  return envelopes;
}
