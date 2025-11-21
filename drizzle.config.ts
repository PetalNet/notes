import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/server/db/schema.ts",
  dialect: "turso",
  dbCredentials: {
    url: "file:notes.db",
  },
});
