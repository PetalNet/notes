import type { RequestEvent } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { User } from "$lib/schema.ts";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const sessionCookieName = "auth-session";

export function generateSessionToken() {
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

export type AuthData =
  | {
      session: undefined;
      user: undefined;
    }
  | {
      session: Session;
      user: User;
    };

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

export async function invalidateSession(sessionId: string) {
  await db.delete(table.sessions).where(eq(table.sessions.token, sessionId));
}

export function setSessionTokenCookie(
  event: RequestEvent,
  token: string,
  expiresAt: Date,
) {
  event.cookies.set(sessionCookieName, token, {
    expires: expiresAt,
    path: "/",
  });
}

export function deleteSessionTokenCookie(event: RequestEvent) {
  event.cookies.delete(sessionCookieName, {
    path: "/",
  });
}
