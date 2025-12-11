import { redirect } from "@sveltejs/kit";
import { invalidateSession, deleteSessionTokenCookie } from "$lib/server/auth";

export async function POST(event) {
  if (!event.locals.session) {
    return redirect(302, "/login");
  }

  await invalidateSession(event.locals.session.token);
  deleteSessionTokenCookie(event.cookies);

  return redirect(302, "/login");
}
