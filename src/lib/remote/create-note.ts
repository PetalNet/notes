import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { encryptKeyForUser, generateNoteKey } from "$lib/crypto";
import { getEncryptedSnapshot } from "$lib/loro.ts";
import { LoroDoc } from "loro-crdt";
import { createNote, getNotes } from "./notes.remote.ts";
import type { User } from "$lib/schema.ts";

export async function handleCreateNote(
  title: string,
  parentId: string | null,
  isFolder: boolean,
  user: User,
): Promise<void> {
  // Generate AES key for the note
  const noteKey = await generateNoteKey();

  // Encrypt note key with user's public key
  const encryptedKey = await encryptKeyForUser(noteKey, user.publicKey);

  // Create the loro snapshot
  const loroSnapshot = await getEncryptedSnapshot(new LoroDoc(), encryptedKey);

  const newNote = await createNote({
    title,
    parentId,
    loroSnapshot,
    isFolder,
    encryptedKey,
  }).updates(
    getNotes().withOverride((notes) => {
      return [
        ...notes,
        {
          content: "",
          createdAt: new Date(),
          encryptedKey,
          id: "",
          isFolder: isFolder,
          loroSnapshot,
          order: 0,
          ownerId: user.id,
          parentId: parentId,
          title,
          updatedAt: new Date(),
        },
      ];
    }),
  );

  if (!isFolder) {
    goto(resolve("/notes/[id]", { id: newNote.id }));
  }
}
