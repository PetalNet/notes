import { form, getRequestEvent } from "$app/server";
import * as auth from "$lib/server/auth.ts";
import { db } from "$lib/server/db/index.ts";
import * as table from "$lib/server/db/schema.ts";
import { hash, verify } from "@node-rs/argon2";
import { fail, invalid, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { Redacted, Schema } from "effect";
import { loginSchema, signupSchema } from "./accounts.schema.ts";

export const login = form(
  loginSchema,
  async ({ username, _password: password }) => {
    const { cookies } = getRequestEvent();

    const results = await db
      .select()
      .from(table.users)
      .where(eq(table.users.username, username));

    const existingUser = results.at(0);
    if (!existingUser) {
      invalid("Incorrect username or password");
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
      invalid("Incorrect username or password");
    }

    const sessionToken = auth.generateSessionToken();
    const session = await auth.createSession(sessionToken, existingUser.id);
    auth.setSessionTokenCookie(cookies, sessionToken, session.expiresAt);

    return redirect(302, "/");
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
      } satisfies table.User);

      const sessionToken = auth.generateSessionToken();
      const session = await auth.createSession(sessionToken, id);
      auth.setSessionTokenCookie(cookies, sessionToken, session.expiresAt);
    } catch {
      return fail(500, { message: "An error has occurred" });
    }
    redirect(302, "/");
  },
);

export const logout = form(
  Schema.Struct({}).pipe(Schema.standardSchemaV1),
  async () => {
    const { cookies } = getRequestEvent();
    const authData = auth.guardLogin();
    await auth.invalidateSession(authData.session.userId);
    auth.deleteSessionTokenCookie(cookies);

    redirect(302, "/login");
  },
);
