import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sessions } from "../src/lib/server/db/schema.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }

  const client = createClient({ url });
  const db = drizzle(client);

  console.log("Clearing all sessions...");
  try {
    const result = await db.delete(sessions);
    console.log("Successfully deleted all sessions.");
  } catch (error) {
    console.error("Error clearing sessions:", error);
    process.exit(1);
  }
  process.exit(0);
}

main();
