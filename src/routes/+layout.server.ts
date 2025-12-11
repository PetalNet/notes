import type { User } from "$lib/schema.ts";
import { db } from "$lib/server/db";
import { eq, ne } from "drizzle-orm";
import type { SharedNote } from "$lib/remote/notes.remote.ts";

export interface Data {
  user: User | undefined;
  sharedNotes: SharedNote[];
}

export const load = async ({ locals }): Promise<Data> => {
  const localUser = locals.user;

  if (!localUser) {
    return { user: undefined, sharedNotes: [] };
  }

  // Get user with private key from database
  const user = await db.query.users.findFirst({
    where: (users) => eq(users.id, localUser.id),
  });

  // Get shared notes directly from DB
  const sharedDocs = await db.query.documents.findMany({
    where: (docs) => ne(docs.hostServer, "local"),
  });

  const sharedNotes: SharedNote[] = sharedDocs.map((doc) => ({
    id: doc.id,
    title: doc.title ?? "Untitled",
    hostServer: doc.hostServer,
    ownerId: doc.ownerId,
    accessLevel: doc.accessLevel,
  }));

  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          publicKey: user.publicKey ?? "", // Handle null publicKey
          privateKeyEncrypted: user.privateKeyEncrypted,
        }
      : undefined,
    sharedNotes,
  };
};
