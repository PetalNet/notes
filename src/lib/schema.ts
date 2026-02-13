import { Schema } from "effect";

export const Uint8ArrayFromSelfSchema =
  Schema.Uint8ArrayFromSelf as Schema.Schema<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >;

export const Uint8ArrayFromBase64Schema =
  Schema.Uint8ArrayFromBase64 as Schema.Schema<Uint8Array<ArrayBuffer>, string>;

interface NoteBase {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  encryptedKey: Uint8Array<ArrayBuffer>;
  parentId: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note extends NoteBase {
  loroSnapshot: Uint8Array<ArrayBuffer>;
  isFolder: false;
}
export interface Folder extends NoteBase {
  isFolder: true;
}
// TODO: Add in Drawing support via Excalidraw
export type NoteOrFolder = Note | Folder;

export interface User {
  id: string;
  username: string;
  publicKey: Uint8Array<ArrayBuffer>; // TODO: This breaks devalue, should do a repro
  privateKeyEncrypted: Uint8Array<ArrayBuffer>;
}
