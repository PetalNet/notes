import { command, form, getRequestEvent } from "$app/server";
import * as auth from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import * as table from "$lib/server/db/schema.ts";
import { hash, verify } from "@node-rs/argon2";
import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { Redacted } from "effect";
import {
  changePasswordSchema,
  loginSchema,
  setupEncryptionSchema,
  signupSchema,
} from "./accounts.schema.ts";

export const setupEncryption = command(
  setupEncryptionSchema,
  async ({ _password: password, publicKey, privateKeyEncrypted }) => {
    const authData = auth.guardLogin();
    const user = authData.user;

    // Verify password one last time
    const userData = await db
      .select()
      .from(table.users)
      .where(eq(table.users.id, user.id));

    const existingUser = userData[0];

    if (!existingUser) {
      error(400, "User not found");
    }

    const validPassword = await verify(
      existingUser.passwordHash,
      password.pipe(Redacted.value),
    );

    if (!validPassword) {
      error(400, "Incorrect password");
    }

    await db
      .update(table.users)
      .set({
        publicKey,
        privateKeyEncrypted,
      })
      .where(eq(table.users.id, user.id));
  },
);

export const login = form(
  loginSchema,
  async ({ username, _password: password }) => {
    const { cookies, url } = getRequestEvent();

    const results = await db
      .select()
      .from(table.users)
      .where(eq(table.users.username, username));

    const existingUser = results.at(0);
    if (!existingUser) {
      error(400, "Incorrect username or password");
    }

    const validPassword = await verify(
      existingUser.passwordHash,
      password.pipe(Redacted.value),
      {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      },
    );
    if (!validPassword) {
      error(400, "Incorrect username or password");
    }

    const sessionToken = auth.generateSessionToken();
    const session = await auth.createSession(sessionToken, existingUser.id);
    auth.setSessionTokenCookie(cookies, sessionToken, session.expiresAt);

    // Redirect to the original destination if provided, otherwise go home
    const redirectTo = url.searchParams.get("redirectTo") || "/";
    // Validate redirectTo to prevent open redirect attacks
    const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";
    throw redirect(302, safeRedirect);
  },
);

export const signup = form(
  signupSchema,
  async ({ username, _password: password, publicKey, privateKeyEncrypted }) => {
    const { cookies } = getRequestEvent();

    const id = crypto.randomUUID();
    const passwordHash = await hash(password.pipe(Redacted.value), {
      // recommended minimum parameters
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });

    try {
      await db.insert(table.users).values({
        id,
        username,
        passwordHash,
        publicKey,
        privateKeyEncrypted,
        createdAt: new Date(),
      });

      const sessionToken = auth.generateSessionToken();
      const session = await auth.createSession(sessionToken, id);
      auth.setSessionTokenCookie(cookies, sessionToken, session.expiresAt);
    } catch {
      error(500, "An error has occurred");
    }
    throw redirect(302, "/");
  },
);

export const changePassword = form(
  changePasswordSchema,
  async ({ _password: password, privateKeyEncrypted }) => {
    const authData = auth.guardLogin();

    const passwordHash = await hash(password.pipe(Redacted.value), {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });

    await db
      .update(table.users)
      .set({
        passwordHash,
        privateKeyEncrypted,
      })
      .where(eq(table.users.id, authData.session.userId));
  },
);
