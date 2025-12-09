import { Schema } from "effect";

const NoteBaseSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  ownerId: Schema.String,
  encryptedKey: Schema.String,
  loroSnapshot: Schema.NullOr(Schema.String),
  parentId: Schema.NullOr(Schema.String),
  order: Schema.Number,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  accessLevel: Schema.optional(Schema.String),
});

export const NoteSchema = Schema.extend(
  NoteBaseSchema,
  Schema.Struct({
    isFolder: Schema.tag(false),
  }),
).pipe(Schema.mutable);

export const FolderSchema = Schema.extend(
  NoteBaseSchema,
  Schema.Struct({
    isFolder: Schema.tag(true),
  }),
).pipe(Schema.mutable);

export const NoteOrFolderSchema = Schema.Union(NoteSchema, FolderSchema);

export type Note = typeof NoteSchema.Type;
export type Folder = typeof FolderSchema.Type;
// TODO: Add in Drawing support via Excalidraw
export type NoteOrFolder = Note | Folder;

export interface User {
  id: string;
  username: string;
  publicKey: string;
  privateKeyEncrypted: string;
}
