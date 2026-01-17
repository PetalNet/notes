import * as auth from "$lib/server/auth";
import type { Handle } from "@sveltejs/kit";

const handleAuth: Handle = async ({ event, resolve }) => {
  const sessionToken = event.cookies.get(auth.sessionCookieName);

  if (!sessionToken) {
    event.locals.user = undefined;
    event.locals.session = undefined;

    // Redirect to login if accessing protected routes
    if (!event.route.id?.startsWith("/(auth)")) {
      return new Response("Redirect", {
        status: 303,
        headers: { Location: "/login" },
      });
    }

    return resolve(event);
  }

  const authData = await auth.validateSessionToken(sessionToken);

  if (authData.session) {
    auth.setSessionTokenCookie(
      event.cookies,
      sessionToken,
      authData.session.expiresAt,
    );
  } else {
    auth.deleteSessionTokenCookie(event.cookies);

    // Redirect to login if session invalid
    if (!event.route.id?.startsWith("/(auth)")) {
      return new Response("Redirect", {
        status: 303,
        headers: { Location: "/login" },
      });
    }
  }

  // Redirect to home if accessing auth routes while logged in
  if (event.route.id?.startsWith("/(auth)")) {
    return new Response("Redirect", {
      status: 303,
      headers: { Location: "/" },
    });
  }

  event.locals.user = authData.user;
  event.locals.session = authData.session;
  return resolve(event);
};

export const handle: Handle = handleAuth;
