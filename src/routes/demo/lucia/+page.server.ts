import * as auth from "$lib/server/auth";
import { fail, redirect } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

export const load = () => {
  const user = requireLogin();
  return { user };
};

export const actions = {
  logout: async (event) => {
    if (!event.locals.session) {
      return fail(401);
    }
    await auth.invalidateSession(event.locals.session.id);
    auth.deleteSessionTokenCookie(event);

    redirect(302, "/demo/lucia/login");
  },
};

function requireLogin(): auth.User {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    redirect(302, "/demo/lucia/login");
  }

  return locals.user;
}
