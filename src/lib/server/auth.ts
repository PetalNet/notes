import type { RequestEvent } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const sessionCookieName = "auth-session";

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = encodeBase64url(bytes);
  return token;
}

export async function createSession(
  token: string,
  userId: string,
): Promise<Session> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const session: table.Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + DAY_IN_MS * 30),
  };
  await db.insert(table.session).values(session);
  return session;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

interface NoAuthData {
  session: undefined;
  user: undefined;
}

interface SomeAuthData {
  session: Session;
  user: User;
}

export interface User {
  id: string;
  username: string;
}

export type AuthData = NoAuthData | SomeAuthData;

export async function validateSessionToken(token: string): Promise<AuthData> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const [result] = await db
    .select({
      // Adjust user table here to tweak returned data
      user: { id: table.user.id, username: table.user.username },
      session: table.session,
    })
    .from(table.session)
    .innerJoin(table.user, eq(table.session.userId, table.user.id))
    .where(eq(table.session.id, sessionId));

  if (!result) {
    return { session: undefined, user: undefined };
  }
  const { session, user } = result;

  const sessionExpired = Date.now() >= session.expiresAt.getTime();
  if (sessionExpired) {
    await db.delete(table.session).where(eq(table.session.id, session.id));
    return { session: undefined, user: undefined };
  }

  const renewSession =
    Date.now() >= session.expiresAt.getTime() - DAY_IN_MS * 15;
  if (renewSession) {
    session.expiresAt = new Date(Date.now() + DAY_IN_MS * 30);
    await db
      .update(table.session)
      .set({ expiresAt: session.expiresAt })
      .where(eq(table.session.id, session.id));
  }

  return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(table.session).where(eq(table.session.id, sessionId));
}

export function setSessionTokenCookie(
  event: RequestEvent,
  token: string,
  expiresAt: Date,
): void {
  event.cookies.set(sessionCookieName, token, {
    expires: expiresAt,
    path: "/",
  });
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
  event.cookies.delete(sessionCookieName, {
    path: "/",
  });
}
