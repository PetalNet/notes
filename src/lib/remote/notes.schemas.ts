import { Uint8ArrayFromSelfSchema } from "$lib/schema.ts";
import { Schema } from "effect";

const CreateNoteSchema = Schema.Struct({
  title: Schema.String,
  parentId: Schema.String.pipe(Schema.NullOr),
  isFolder: Schema.Boolean,
  encryptedKey: Uint8ArrayFromSelfSchema,
});
export const createNoteSchema = CreateNoteSchema.pipe(Schema.standardSchemaV1);

const DeleteNoteSchema = Schema.String;
export const deleteNoteSchema = DeleteNoteSchema.pipe(Schema.standardSchemaV1);

const UpdateNoteSchema = Schema.Struct({
  noteId: Schema.String,
  title: Schema.optional(Schema.String),
  loroSnapshot: Schema.optional(Uint8ArrayFromSelfSchema),
  parentId: Schema.optional(Schema.String.pipe(Schema.NullOr)),
});

export const updateNoteSchema = UpdateNoteSchema.pipe(Schema.standardSchemaV1);

const ReorderNotesSchema = Schema.Struct({
  id: Schema.String,
  order: Schema.Number,
}).pipe(Schema.Array);

export const reorderNotesSchema = ReorderNotesSchema.pipe(
  Schema.standardSchemaV1,
);

const SyncSchema = Schema.Struct({
  noteId: Schema.String,
  updates: Schema.Array(Schema.String),
});
export const syncSchemaJson = Schema.parseJson(SyncSchema);
export const syncSchema = SyncSchema.pipe(Schema.standardSchemaV1);
