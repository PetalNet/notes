import type { User } from "$lib/schema.ts";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema.ts";
import { eq } from "drizzle-orm";

export interface Data {
  user: User | undefined;
}

export const load = async ({ locals }): Promise<Data> => {
  const localUser = locals.user;

  if (!localUser) {
    return { user: undefined };
  }

  // Get user with private key from database
  const [user] = await db
    .select({
      id: table.users.id,
      username: table.users.username,
      publicKey: table.users.publicKey,
      privateKeyEncrypted: table.users.privateKeyEncrypted,
    })
    .from(table.users)
    .where(eq(table.users.id, localUser.id));

  return { user };
};
