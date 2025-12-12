import { error, redirect, type Cookies } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { User } from "$lib/schema.ts";
import { getRequestEvent } from "$app/server";

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
    token: sessionId,
    userId,
    expiresAt: new Date(Date.now() + DAY_IN_MS * 30),
  };
  await db.insert(table.sessions).values(session);
  return session;
}

export interface Session {
  token: string;
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

export type AuthData = NoAuthData | SomeAuthData;

export async function validateSessionToken(token: string): Promise<AuthData> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const [result] = await db
    .select({
      // Adjust user table here to tweak returned data
      user: {
        id: table.users.id,
        username: table.users.username,
        publicKey: table.users.publicKey,
        privateKeyEncrypted: table.users.privateKeyEncrypted,
      },
      session: table.sessions,
    })
    .from(table.sessions)
    .innerJoin(table.users, eq(table.sessions.userId, table.users.id))
    .where(eq(table.sessions.token, sessionId));

  if (result === undefined) {
    return { session: undefined, user: undefined };
  }

  const { session, user } = result;

  const sessionExpired = Date.now() >= session.expiresAt.getTime();
  if (sessionExpired) {
    await db
      .delete(table.sessions)
      .where(eq(table.sessions.token, session.token));
    return { session: undefined, user: undefined };
  }

  const renewSession =
    Date.now() >= session.expiresAt.getTime() - DAY_IN_MS * 15;
  if (renewSession) {
    session.expiresAt = new Date(Date.now() + DAY_IN_MS * 30);
    await db
      .update(table.sessions)
      .set({ expiresAt: session.expiresAt })
      .where(eq(table.sessions.token, session.token));
  }

  return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(table.sessions).where(eq(table.sessions.token, sessionId));
}

export function setSessionTokenCookie(
  cookies: Cookies,
  token: string,
  expiresAt: Date,
): void {
  cookies.set(sessionCookieName, token, {
    expires: expiresAt,
    path: "/",
  });
}

export function deleteSessionTokenCookie(cookies: Cookies): void {
  cookies.delete(sessionCookieName, {
    path: "/",
  });
}

export function guardLogin(): SomeAuthData {
  const {
    locals: { user, session },
  } = getRequestEvent();

  if (!user || !session) {
    redirect(302, "/login");
  }

  return { user, session };
}

export function requireLogin(): SomeAuthData {
  const {
    locals: { user, session },
  } = getRequestEvent();

  if (!user || !session) error(401, "Unauthorized");

  return { user, session };
}
