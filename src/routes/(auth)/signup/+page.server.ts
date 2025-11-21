import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

export const load = async (event) => {
  if (event.locals.user) {
    return redirect(302, resolve("/"));
  }
  return {};
};
