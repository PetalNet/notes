import { redirect, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { documents, members, notes, devices } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getServerIdentity, signServerRequest } from "$lib/server/identity";
import {
  generateEncryptionKeyPair,
  decryptKeyForDevice,
  encryptKeyForDevice,
} from "$lib/crypto";

export async function load({ url, locals }) {
  if (!locals.user) {
    throw redirect(
      302,
      `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
    );
  }

  const doc_id = url.searchParams.get("doc_id");
  const host = url.searchParams.get("host");

  if (!doc_id || !host) {
    throw error(400, "Missing doc_id or host");
  }

  const identity = await getServerIdentity();
  const user = locals.user;

  // Check if we already have the doc
  const existing = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  if (existing) {
    // Already imported, just redirect
    throw redirect(302, `/notes/${doc_id}`);
  }

  // Perform Join
  // 1. Fetch user's devices to request keys for?
  // Actually, Server A (Host) needs to know which users to generate envelopes for.
  // If User B is joining, we send User B's ID (federated ID: @user:domain).
  // But Server A might not know User B's device keys yet?
  // "Join" implies we are asking for keys.
  // Usually we exchange keys first.
  // Spec: "Join... We expect them to be allowed...".

  // Complex part: How does Server A know User B's device public key to encrypt the note key?
  // Option A: User B published keys to Server A previously (via Join Request payload?).
  // Option B: Server A queries Server B Identity endpoint `/.well-known/notes-identity/user`.

  // Let's assume Option B: Host looks up Joiner's identity.
  // So we just send `users: ["bob"]` (local username or full handle?) -> Federated Handle `@bob:server-b.com`.

  const userHandle = `@${user.username}`; // Requesting for local user

  // Sign request
  const payload = {
    requesting_server: identity.domain,
    users: [userHandle], // List of users I am joining on behalf of
  };

  const { signature, timestamp, domain } = await signServerRequest(payload);

  const protocol = host.includes("localhost") ? "http" : "https";
  const joinUrl = `${protocol}://${host}/federation/doc/${doc_id}/join`;

  let joinRes;
  try {
    const res = await fetch(joinUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notes-signature": signature,
        "x-notes-timestamp": timestamp.toString(),
        "x-notes-domain": domain,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Join failed:", text);
      throw error(res.status as any, "Failed to join document on host server");
    }

    joinRes = await res.json();
  } catch (e) {
    console.error("Join error:", e);
    throw error(502, "Failed to contact host server");
  }

  // Process Response
  // { snapshot: ..., envelopes: [...] }

  // Save Document Metadata
  await db.insert(documents).values({
    id: doc_id,
    hostServer: host,
    ownerId: "unknown", // or fetch from host
    // ...
  });

  // Save Content (Snapshot)
  if (joinRes.snapshot) {
    await db
      .insert(notes)
      .values({
        id: doc_id,
        ownerId: user.id, // Local owner? Or proxy?
        // If we are replica, ownerId might be irrelevant or we keep original owner ID string?
        // Schema `notes.ownerId` is `text`.
        loroSnapshot: joinRes.snapshot,
      })
      .onConflictDoUpdate({
        target: notes.id,
        set: { loroSnapshot: joinRes.snapshot },
      });
  }

  // Save Envelopes
  // joinRes.envelopes: [{ user_id, device_id, encrypted_key }]
  // We need to map these to local `members` table.

  for (const env of joinRes.envelopes) {
    // user_id from host might be `@bob:server-b.com` or just `bob`?
    // Hosted returns what we asked or canonical.

    // We need to store it for OUR local user.
    // `members` table links to `users`? Schema check: `userId` is text, not reference?
    // Let's check schema.

    await db
      .insert(members)
      .values({
        docId: doc_id,
        userId: user.id, // Map back to local ID? Or store federated ID?
        // If `members.userId` is used for auth checks, it better match `locals.user.id`.
        // But if it receives envelopes for multiple devices?
        deviceId: env.device_id,
        role: "writer", // Assume writer if joined?
        encryptedKeyEnvelope: env.encrypted_key,
      })
      .onConflictDoNothing();
  }

  throw redirect(302, `/notes/${doc_id}`);
}
