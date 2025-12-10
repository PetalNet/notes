import type { PageServerLoad } from "./$types.js";
import { parseNoteId } from "$lib/noteId.ts";
import { env } from "$env/dynamic/private";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  const currentDomain = env["SERVER_DOMAIN"] || "localhost:5173";

  // Parse note ID to check origin
  const { origin, uuid } = parseNoteId(id);

  // Pass origin info to client for federation handling
  return {
    noteId: id,
    noteUuid: uuid,
    originServer: origin || currentDomain,
    isLocal: !origin || origin === currentDomain,
  };
};
