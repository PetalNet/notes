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
  children: Schema.Array(
    Schema.suspend(
      (): Schema.Schema<NoteOrFolder, NoteOrFolderEncoded> =>
        NoteOrFolderSchema,
    ),
  ),
});

export const NoteOrFolderSchema = Schema.Union(NoteSchema, FolderSchema);

interface NoteBase {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly encryptedKey: string;
  readonly loroSnapshot: string | null;
  readonly parentId: string | null;
  readonly order: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Note extends NoteBase {
  readonly isFolder: false;
}
export interface Folder extends NoteBase {
  readonly isFolder: true;
  readonly children: ReadonlyArray<NoteOrFolder>;
}
export type NoteOrFolder = Note | Folder;

export interface NoteEncoded
  extends Schema.Struct.Encoded<typeof NoteBaseSchema.fields> {
  readonly isFolder: false;
}

export interface FolderEncoded
  extends Schema.Struct.Encoded<typeof NoteBaseSchema.fields> {
  readonly isFolder: true;
  readonly children: ReadonlyArray<NoteOrFolderEncoded>;
}

export type NoteOrFolderEncoded = NoteEncoded | FolderEncoded;
