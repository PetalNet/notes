import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as auth from "$lib/server/auth";

export const POST = async ({ request, cookies }) => {
  try {
    const { username, password, publicKey, privateKeyEncrypted } =
      await request.json();

    if (!username || !password || !publicKey || !privateKeyEncrypted) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if username already exists
    const existing = await db.query.users.findFirst({
      where: (users) => eq(users.username, username),
    });

    if (existing) {
      return json({ error: "Username already taken" }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      username,
      passwordHash,
      publicKey,
      privateKeyEncrypted,
      createdAt: new Date(),
    });

    // Create session using auth module
    const token = auth.generateSessionToken();
    const session = await auth.createSession(token, id);

    // Set session cookie
    cookies.set("auth-session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      expires: session.expiresAt,
      secure: process.env.NODE_ENV === "production",
    });

    return json({ success: true, user: { id, username } });
  } catch (error) {
    console.error("Signup error:", error);
    return json({ error: "Signup failed" }, { status: 500 });
  }
};
