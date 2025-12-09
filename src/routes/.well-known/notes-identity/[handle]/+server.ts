import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { users, devices } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

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

  const userDevices = await db.query.devices.findMany({
    where: eq(devices.userId, user.id),
  });

  return json({
    id: user.id,
    handle: `@${user.username}`, // Canonical handle
    publicKey: user.publicKey,
    devices: userDevices.map((d) => ({
      device_id: d.deviceId,
      public_key: d.publicKey,
    })),
  });
}
