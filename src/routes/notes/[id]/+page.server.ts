import * as auth from "$lib/server/auth";
import { fail, redirect } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import type { User } from "$lib/schema.ts";

export const load = () => {
  const user = requireLogin();
  return { user };
};

// TODO: move to full-fledged route instead of an action
export const actions = {
  logout: async (event) => {
    if (!event.locals.session) {
      return fail(401);
    }
    await auth.invalidateSession(event.locals.session.userId);
    auth.deleteSessionTokenCookie(event);

    return redirect(302, "/login");
  },
};

function requireLogin(): User {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    return redirect(302, "/login");
  }

  return locals.user;
}
