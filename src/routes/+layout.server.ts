import type { User } from "$lib/schema.ts";
import { db } from "$lib/server/db";

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
    where: {
      id: localUser.id,
    },
  });

  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          publicKey: new Uint8Array(user.publicKey),
          privateKeyEncrypted: new Uint8Array(user.privateKeyEncrypted),
        }
      : undefined,
  };
};
