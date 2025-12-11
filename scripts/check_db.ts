import "dotenv/config";

import { sql, count } from "drizzle-orm";
import { users } from "$lib/server/db/schema.ts";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/server/db/schema.ts";

if (!process.env["DATABASE_URL"]) throw new Error("DATABASE_URL is not set");

const client = createClient({
  url: process.env["DATABASE_URL"],
});

const db = drizzle(client, { schema });

try {
  const result = await db.run(sql`PRAGMA tabdrizzle, le_info(users);`);
  console.log("Users table columns:");
  result.rows.forEach((row) => {
    const r = row as unknown as { name: string; type: string };
    console.log(`- ${r.name} (${r.type})`);
  });

  const [userCount] = await db.select({ count: count() }).from(users);
  console.log(`User count: ${String(userCount?.count ?? 0)}`);
} catch (e) {
  console.error("Error:", e);
}
