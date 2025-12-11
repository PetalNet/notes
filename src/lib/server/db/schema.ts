import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  handle: text("handle").unique(), // Federated handle, e.g. "alice"
  passwordHash: text("password_hash").notNull(),
  publicKey: text("public_key"), // Ed25519 public key
  privateKeyEncrypted: text("private_key_encrypted").notNull(), // Existing field, encrypted with password
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  deviceId: text("device_id").notNull(),
  publicKey: text("public_key").notNull(), // Device specific public key (X25519/Ed25519)
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

// The core document table for federated notes
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), // UUID
  hostServer: text("host_server").notNull(), // e.g. "home.example.com" or "local"
  ownerId: text("owner_id").notNull(), // Federated ID or local user ID
  title: text("title"),
  accessLevel: text("access_level").notNull().default("private"),
  documentKeyEncrypted: text("document_key_encrypted"),
  serverEncryptedKey: text("server_encrypted_key"), // Encrypted for the Home Server (Key Broker)
  passwordEncryptedKey: text("password_encrypted_key"), // Encrypted with Note Password (for password-protected access)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const members = sqliteTable(
  "members",
  {
    docId: text("doc_id")
      .notNull()
      .references(() => documents.id),
    userId: text("user_id").notNull(), // Federated ID
    role: text("role").notNull().default("writer"), // reader, writer, owner
    encryptedKeyEnvelope: text("encrypted_key_envelope"), // Encrypted doc key for this user/device
    deviceId: text("device_id").notNull(), // If key is per-device, make it not null as per PK
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.docId, t.userId, t.deviceId] })],
);

export const federatedOps = sqliteTable("federated_ops", {
  id: text("id").primaryKey(), // composite or specific ID?
  docId: text("doc_id")
    .notNull()
    .references(() => documents.id),
  opId: text("op_id").notNull(), // actor+counter
  actorId: text("actor_id").notNull(),
  lamportTs: integer("lamport_ts").notNull(),
  payload: text("payload").notNull(), // Encrypted blob (base64)
  signature: text("signature").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Keeping existing tables for now to avoid immediate breakage,
// but we might migrate `notes` -> `documents` logic.
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  encryptedKey: text("encrypted_key").notNull(),
  loroSnapshot: text("loro_snapshot"),
  accessLevel: text("access_level").notNull().default("private"), // private, authenticated, open, invite_only
  documentKeyEncrypted: text("document_key_encrypted"), // Document key encrypted for owner
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

export const noteShares = sqliteTable("note_shares", {
  id: text("id").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .references(() => notes.id),
  sharedWithUser: text("shared_with_user").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  permissions: text("permissions").notNull().default("read"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

import { relations } from "drizzle-orm";

export const usersRelations = relations(users, ({ many }) => ({
  notes: many(notes),
  memberships: many(members),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  members: many(members),
}));

export const membersRelations = relations(members, ({ one }) => ({
  document: one(documents, {
    fields: [members.docId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  owner: one(users, {
    fields: [notes.ownerId],
    references: [users.id],
  }),
  shares: many(noteShares),
  document: one(documents, {
    fields: [notes.id],
    references: [documents.id],
  }),
}));

export const noteSharesRelations = relations(noteShares, ({ one }) => ({
  note: one(notes, {
    fields: [noteShares.id], // typo in schema? id is PK. noteId is FK.
    references: [notes.id],
  }),
}));

export const joinRequests = sqliteTable("join_requests", {
  id: text("id").primaryKey(), // UUID
  docId: text("doc_id")
    .notNull()
    .references(() => documents.id),
  userId: text("user_id").notNull(), // The user requesting access
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  publicKey: text("public_key").notNull(), // The requester's public key (to lock the note key against)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const joinRequestsRelations = relations(joinRequests, ({ one }) => ({
  document: one(documents, {
    fields: [joinRequests.docId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [joinRequests.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Member = typeof members.$inferSelect;
export type FederatedOp = typeof federatedOps.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteShare = typeof noteShares.$inferSelect;
export type JoinRequest = typeof joinRequests.$inferSelect;
