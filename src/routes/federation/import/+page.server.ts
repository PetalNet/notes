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

  // Construct the federated handle for the joining user
  const userHandle = `@${user.username}:${identity.domain}`;

  // Sign request
  const payload = {
    requesting_server: identity.domain,
    users: [userHandle], // Full federated handle
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
      throw error(res.status as any, `Failed to join document: ${text}`);
    }

    joinRes = await res.json();
  } catch (e: any) {
    console.error("Join error:", e);
    if (e.status) throw e; // Re-throw if it's already an error response
    throw error(502, "Failed to contact host server");
  }

  // Process Response
  // { snapshot, envelopes: [{ user_id, device_id, encrypted_key }], title, accessLevel }

  // Find the envelope for our user
  const myEnvelope = joinRes.envelopes?.find(
    (env: any) =>
      env.user_id === userHandle ||
      env.user_id === `@${user.username}` ||
      env.user_id === user.username,
  );

  const encryptedKey = myEnvelope?.encrypted_key || "";

  // Save Document Metadata
  await db.insert(documents).values({
    id: doc_id,
    hostServer: host,
    ownerId: joinRes.ownerId || "unknown",
    title: joinRes.title || "Untitled",
    accessLevel: joinRes.accessLevel || "authenticated",
  });

  // Save Content (Snapshot) - use empty snapshot if none provided
  await db
    .insert(notes)
    .values({
      id: doc_id,
      ownerId: user.id, // Local user becomes local "owner" of this copy
      title: joinRes.title || "Untitled",
      encryptedKey, // The encrypted document key for this user
      loroSnapshot: joinRes.snapshot || null,
      accessLevel: joinRes.accessLevel || "authenticated",
    })
    .onConflictDoUpdate({
      target: notes.id,
      set: {
        loroSnapshot: joinRes.snapshot || null,
        encryptedKey,
        updatedAt: new Date(),
      },
    });

  // Save all envelopes to members table
  for (const env of joinRes.envelopes || []) {
    await db
      .insert(members)
      .values({
        docId: doc_id,
        userId: user.id, // Map to local user ID
        deviceId: env.device_id || "primary",
        role: "writer",
        encryptedKeyEnvelope: env.encrypted_key,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  throw redirect(302, `/notes/${doc_id}`);
}
