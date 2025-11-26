import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import type { User } from "$lib/schema.js";

export interface Data {
  user: User | undefined;
}

export const load = async ({ locals }): Promise<Data> => {
  const localUser = locals.user;

  if (!localUser) {
    return { user: undefined };
  }

  // Get user with private key from database
  const user = await db.query.users.findFirst({
    where: (users) => eq(users.id, localUser.id),
  });

  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey,
          privateKeyEncrypted: user.privateKeyEncrypted,
        }
      : undefined,
  };
};
