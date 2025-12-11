import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { env } from "$env/dynamic/private";

export async function GET({ params }) {
  const { handle } = params;

  // Assume handle is the username for now for local lookups
  // Ideally this endpoint serves `/.well-known/notes-identity/@alice`
  // so we strip the @ if needed, or query by it.

  // Clean handle: remove leading @
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

  // If handle contains ':', it might include domain, but this is the home server,
  // so we expect to serve our own users.
  // We'll look up by username locally.
  const username = cleanHandle.split(":")[0];

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  // Return public identity
  // IMPORTANT: Return the FULL federated handle so other servers know exactly who this is.
  // e.g. @bob -> @bob:localhost:5174
  const fullHandle = `@${user.username}:${env["SERVER_DOMAIN"] ?? "localhost:5173"}`;

  return json({
    id: user.id,
    handle: fullHandle,
    publicKey: user.publicKey,
    devices: [], // TODO: fetch devices
  });
}
