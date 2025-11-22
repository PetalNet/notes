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
});

export const NoteSchema = Schema.Struct({
  ...NoteBaseSchema.fields,
  isFolder: Schema.Literal(false),
});

export const FolderSchema = Schema.Struct({
  ...NoteBaseSchema.fields,
  isFolder: Schema.Literal(true),
});

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
