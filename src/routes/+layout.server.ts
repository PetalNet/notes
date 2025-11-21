import type { LayoutServerLoad } from "./$types";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";

export const load: LayoutServerLoad = async ({ locals }) => {
  const localUser = locals.user;

  if (!localUser) {
    return { user: null };
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
      : null,
  };
};
