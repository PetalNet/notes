import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { uint8array } from "./columns.ts";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  publicKey: uint8array("public_key").notNull(),
  privateKeyEncrypted: uint8array("private_key_encrypted").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  encryptedKey: uint8array("encrypted_key").notNull(),
  loroSnapshot: uint8array("loro_snapshot").notNull(),
  parentId: text("parent_id"),
  isFolder: integer("is_folder", { mode: "boolean" }).notNull().default(false),
  order: integer("order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Note = typeof notes.$inferSelect;
