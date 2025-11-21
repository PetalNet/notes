import type { Handle } from "@sveltejs/kit";
import * as auth from "$lib/server/auth";

const handleAuth: Handle = async ({ event, resolve }) => {
  const sessionToken = event.cookies.get(auth.sessionCookieName);

  if (!sessionToken) {
    event.locals.user = null;
    event.locals.session = null;

    // Redirect to login if accessing protected routes
    if (event.url.pathname === "/") {
      return new Response("Redirect", {
        status: 303,
        headers: { Location: "/login" },
      });
    }

    return resolve(event);
  }

  const { session, user } = await auth.validateSessionToken(sessionToken);

  if (session) {
    auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
  } else {
    auth.deleteSessionTokenCookie(event);

    // Redirect to login if session invalid
    if (event.url.pathname === "/") {
      return new Response("Redirect", {
        status: 303,
        headers: { Location: "/login" },
      });
    }
  }

  event.locals.user = user;
  event.locals.session = session;
  return resolve(event);
};

export const handle: Handle = handleAuth;
