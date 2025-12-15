import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { instrumentDrizzleClient } from "@kubiks/otel-drizzle";
import { drizzle } from "drizzle-orm/libsql";
import { relations } from "./relations.ts";
import * as schema from "./schema.ts";

if (!env["DATABASE_URL"]) throw new Error("DATABASE_URL is not set");

export const db = drizzle(env["DATABASE_URL"], {
  schema,
  relations,
  logger: dev,
});
instrumentDrizzleClient(db, { dbSystem: "sqlite" });
