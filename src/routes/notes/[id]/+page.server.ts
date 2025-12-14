import { getNote } from "$lib/remote/notes.ts";
import { guardLogin } from "$lib/server/auth.ts";
import { error } from "@sveltejs/kit";

export const load = async ({ params }): Promise<void> => {
  guardLogin();

  const note = await getNote(params.id);

  if (!note) error(404, "Note not found?");
};
