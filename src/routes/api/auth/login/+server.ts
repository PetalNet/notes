import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as auth from "$lib/server/auth";

export const POST = async ({ request, cookies }) => {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return json({ error: "Missing username or password" }, { status: 400 });
    }

    // Find user
    const user = await db.query.users.findFirst({
      where: (users) => eq(users.username, username),
    });

    if (!user) {
      return json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Create session using auth module
    const token = auth.generateSessionToken();
    const session = await auth.createSession(token, user.id);

    // Set session cookie
    cookies.set("auth-session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      expires: session.expiresAt,
      secure: process.env.NODE_ENV === "production",
    });

    return json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        privateKeyEncrypted: user.privateKeyEncrypted, // Send encrypted private key to client
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return json({ error: "Login failed" }, { status: 500 });
  }
};
