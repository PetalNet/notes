import { Schema } from "effect";

export const Uint8ArrayFromSelfSchema =
  Schema.Uint8ArrayFromSelf as Schema.Schema<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >;

export const Uint8ArrayFromBase64Schema =
  Schema.Uint8ArrayFromBase64 as Schema.Schema<Uint8Array<ArrayBuffer>, string>;

const NoteBaseSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  ownerId: Schema.String,
  encryptedKey: Uint8ArrayFromSelfSchema,
  loroSnapshot: Schema.NullOr(Uint8ArrayFromSelfSchema),
  parentId: Schema.NullOr(Schema.String),
  order: Schema.Number,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
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
  publicKey: Uint8Array<ArrayBuffer>;
  privateKeyEncrypted: Uint8Array<ArrayBuffer>;
}
