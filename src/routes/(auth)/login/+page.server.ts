import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

export const load = (event) => {
  if (event.locals.user) {
    redirect(302, resolve("/"));
  }
};
