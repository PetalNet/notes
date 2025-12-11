import { env } from "$env/dynamic/private";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";
import { relations } from "./relations.ts";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export const db = drizzle(env.DATABASE_URL, { schema, relations });
