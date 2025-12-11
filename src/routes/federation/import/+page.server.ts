import { redirect, error, isHttpError } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { documents, members, notes } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getServerIdentity, signServerRequest } from "$lib/server/identity";
import type { User } from "$lib/schema.js";

export async function load({ url, locals }) {
  if (!locals.user) {
    redirect(
      302,
      `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
    );
  }

  const doc_id = url.searchParams.get("doc_id");
  const host = url.searchParams.get("host");

  if (!doc_id || !host) {
    error(400, "Missing doc_id or host");
  }

  const identity = await getServerIdentity();
  const user: User = locals.user;

  // Check if we already have the doc
  const existing = await db.query.documents.findFirst({
    where: eq(documents.id, doc_id),
  });

  if (existing) {
    // Already imported, just redirect
    redirect(302, `/notes/${doc_id}`);
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

  let joinRes: {
    snapshot: string | undefined;
    envelopes:
      | {
          user_id: string | undefined;
          device_id: string | undefined;
          encrypted_key: string | undefined;
        }[]
      | undefined;
    title: string | undefined;
    accessLevel: string | undefined;
    ownerId: string | undefined;
  };
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
      error(res.status, `Failed to join document: ${text}`);
    }

    joinRes = await res.json();
  } catch (e) {
    console.error("Join error:", e);
    if (isHttpError(e)) throw e; // Re-throw if it's already an error response
    error(502, "Failed to contact host server");
  }

  // Find the envelope for our user
  const myEnvelope = joinRes.envelopes?.find(
    (env) =>
      env.user_id === userHandle ||
      env.user_id === `@${user.username}` ||
      env.user_id === user.username,
  );

  const encryptedKey = myEnvelope?.encrypted_key ?? "";

  // Save Document Metadata
  await db.insert(documents).values({
    id: doc_id,
    hostServer: host,
    ownerId: joinRes.ownerId ?? "unknown",
    title: joinRes.title ?? "Untitled",
    accessLevel: joinRes.accessLevel ?? "authenticated",
  });

  // Save Content (Snapshot) - use empty snapshot if none provided
  await db
    .insert(notes)
    .values({
      id: doc_id,
      ownerId: user.id, // Local user becomes local "owner" of this copy
      title: joinRes.title ?? "Untitled",
      encryptedKey, // The encrypted document key for this user
      loroSnapshot: joinRes.snapshot ?? null,
      accessLevel: joinRes.accessLevel ?? "authenticated",
    })
    .onConflictDoUpdate({
      target: notes.id,
      set: {
        loroSnapshot: joinRes.snapshot ?? null,
        encryptedKey,
        updatedAt: new Date(),
      },
    });

  // Save all envelopes to members table
  for (const env of joinRes.envelopes ?? []) {
    await db
      .insert(members)
      .values({
        docId: doc_id,
        userId: user.id, // Map to local user ID
        deviceId: env.device_id ?? "primary",
        role: "writer",
        encryptedKeyEnvelope: env.encrypted_key,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  redirect(302, `/notes/${doc_id}`);
}
