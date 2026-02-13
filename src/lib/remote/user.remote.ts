import { getRequestEvent, query } from "$app/server";
import type { User } from "$lib/schema";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema.ts";
import { eq } from "drizzle-orm";

export const getUser = query(async (): Promise<User | undefined> => {
  const {
    locals: { user: localUser },
  } = getRequestEvent();

  if (!localUser) {
    return undefined;
  }
  const [user] = await db
    .select({
      id: table.users.id,
      username: table.users.username,
      publicKey: table.users.publicKey,
      privateKeyEncrypted: table.users.privateKeyEncrypted,
    })
    .from(table.users)
    .where(eq(table.users.id, localUser.id));

  return user;
});
