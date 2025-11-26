import { getNotes } from "$lib/remote/notes.remote.ts";
import { guardLogin } from "$lib/server/auth.ts";
import { error } from "@sveltejs/kit";

export const load = async ({ params }): Promise<void> => {
  guardLogin();

  const notesList = await getNotes();
  const note = notesList.find((n) => n.id === params.id);
  if (note === undefined) {
    error(404, "Note not found");
  }
};
