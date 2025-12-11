import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/server/db/schema.ts";

if (!process.env["DATABASE_URL"]) throw new Error("DATABASE_URL is not set");

const client = createClient({
  url: process.env["DATABASE_URL"],
});

const db = drizzle(client, { schema });

console.log("Clearing all sessions...");
try {
  await db.delete(schema.sessions);
  console.log("Successfully deleted all sessions.");
} catch (error) {
  console.error("Error clearing sessions:", error);
  process.exit(1);
}
process.exit(0);
