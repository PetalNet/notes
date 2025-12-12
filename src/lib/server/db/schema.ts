import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  publicKey: blob("public_key", { mode: "buffer" })
    .$type<Uint8Array<ArrayBuffer>>()
    .notNull(),
  privateKeyEncrypted: blob("private_key_encrypted", { mode: "buffer" })
    .$type<Uint8Array<ArrayBuffer>>()
    .notNull(),
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
  encryptedKey: blob("encrypted_key", { mode: "buffer" })
    .$type<Uint8Array<ArrayBuffer>>()
    .notNull(),
  loroSnapshot: blob("loro_snapshot", { mode: "buffer" })
    .$type<Uint8Array<ArrayBuffer>>()
    .notNull(),
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
