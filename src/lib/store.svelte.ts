import { generateNoteKey, encryptKeyForUser, decryptKey } from "$lib/crypto";
import { LoroNoteManager } from "$lib/loro";
import { Order } from "effect";
import * as notesApi from "./remote/notes.remote.ts";
import type { Folder, Note, NoteOrFolder } from "./schema.ts";
import { page } from "$app/state";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { SvelteMap } from "svelte/reactivity";
import type { ReorderNotes } from "./remote/notes.schemas.ts";

//#region Tree
export type TreeNode = NoteOrFolder & { children: TreeNode[] };

const byOrder = Order.mapInput<number, TreeNode>(
  Order.number,
  (node) => node.order,
);

// Recursive function to sort children at all levels
function treeToSorted(tree: readonly TreeNode[]): TreeNode[] {
  return tree
    .toSorted(byOrder)
    .map((node) =>
      node.isFolder ? { ...node, children: treeToSorted(node.children) } : node,
    );
}
//#endregion

//#region Auth
interface AuthStore {
  // TODO: Audit
  userPrivateKey?: string | undefined;
}

export const auth = $state<AuthStore>({});

export function setUserPrivateKey(privateKey: string) {
  auth.userPrivateKey = privateKey;
}
type MaybeFolder<IsFolder extends boolean> = IsFolder extends true
  ? Folder
  : IsFolder extends false
    ? Note
    : NoteOrFolder;

//#endregion

//#region Notes

export class Notes {
  #notesList = $state<NoteOrFolder[]>([]);

  #selectedNoteId = $derived(page.params.id);

  /** Derived note tree for sidebar. */
  #notesTree = $derived.by(() => {
    console.log("Recalculating note tree");

    const map = new SvelteMap<string, TreeNode>();
    const roots: TreeNode[] = [];

    // First pass: create map entries
    for (const note of this.#notesList) {
      map.set(note.id, { ...note, children: [] });
    }

    // Second pass: build tree
    for (const note of this.#notesList) {
      const current = map.get(note.id)!;

      if (note.parentId) {
        const parent = map.get(note.parentId);
        if (parent?.isFolder) {
          parent.children.push(current);
        } else {
          // Parent not found (maybe deleted?), treat as root or orphan
          roots.push(current);
        }
      } else {
        roots.push(current);
      }
    }

    const tree = treeToSorted(roots);

    console.log(tree);

    return tree;
  });

  get notesList(): NoteOrFolder[] {
    return this.#notesList;
  }
  get notesTree(): TreeNode[] {
    return this.#notesTree;
  }

  get selectedNoteId(): string | undefined {
    return this.#selectedNoteId;
  }

  /** Load current user's notes from the API. */
  async load(): Promise<void> {
    // TODO: Why do we waterfall? Shouldn't we SSR this?
    this.#notesList = await notesApi.getNotes();
  }

  /** Create new note with encryption. */
  async createNote<IsFolder extends boolean>(
    title: string,
    parentId: string | null,
    isFolder: IsFolder,
    publicKey: string,
  ): Promise<MaybeFolder<IsFolder>> {
    try {
      console.log("createNote called");

      // Generate AES key for the note
      const noteKey = await generateNoteKey();

      // Encrypt note key with user's public key
      const encryptedKey = await encryptKeyForUser(noteKey, publicKey);

      const data = await notesApi.createNote({
        title,
        encryptedKey,
        parentId,
        isFolder,
      });

      const newNote: NoteOrFolder = { ...data, content: "" };

      this.#notesList.push(newNote);
      goto(resolve("/notes/[id]", { id: newNote.id }));

      // Create Loro manager for the new note
      if (!isFolder) {
        await getLoroManager(newNote.id);
      }

      return newNote as MaybeFolder<IsFolder>;
    } catch (error) {
      console.error("Create note error:", error);
      throw error;
    }
  }

  /** Create folder (wrapper for createNote). */
  async createFolder(
    title: string,
    parentId: string | null,
    publicKey: string,
  ): Promise<Folder> {
    return await this.createNote(title, parentId, true, publicKey);
  }

  /** Delete note. */
  async deleteNote(noteId: string): Promise<void> {
    try {
      await notesApi.deleteNote(noteId);

      this.#notesList = this.#notesList.filter((note) => note.id !== noteId);

      // Clear selection if deleted note was selected
      if (page.params.id === noteId) {
        goto(resolve("/"));
      }

      // Clean up Loro manager
      const manager = loroManagers.get(noteId);
      if (manager) {
        manager.destroy();
        loroManagers.delete(noteId);
      }
    } catch (error) {
      console.error("Delete note error:", error);
      throw error;
    }
  }

  /** Update note content (wrapper for updating specific fields). */
  async updateNoteContent(
    noteId: string,
    title?: string,
    content?: string,
  ): Promise<void> {
    if (title !== undefined) {
      await this.updateNoteTitle(noteId, title);
    }
    if (content !== undefined) {
      const manager = loroManagers.get(noteId);
      if (manager) {
        manager.updateContent(content);
      }
    }
  }

  /** Update note title. */
  async updateNoteTitle(noteId: string, title: string): Promise<void> {
    try {
      const newlyUpdatedNote = await notesApi.updateNote({ noteId, title });

      // TODO: Switch to Effect/Optic?
      const note = this.#notesList.find((n) => n.id === noteId);
      if (note) note.title = newlyUpdatedNote.title;
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Move note to folder (update parentId). */
  async moveNoteToFolder(noteId: string, newParentId: string | null) {
    try {
      const newlyUpdatedNote = await notesApi.updateNote({
        noteId,
        parentId: newParentId,
      });

      // TODO: Switch to Effect/Optic?
      const note = this.#notesList.find((n) => n.id === noteId);
      if (note) note.parentId = newlyUpdatedNote.parentId;
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Helper function for API updates. */
  async updateNote(noteId: string, loroSnapshot: string) {
    try {
      await notesApi.updateNote({ noteId, loroSnapshot });
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Reorder notes. */
  async reorderNotes(updates: ReorderNotes) {
    try {
      await notesApi.reorderNotes(updates);

      // Update local state
      this.#notesList = this.#notesList.map((note) => {
        const update = updates.find((u) => u.id === note.id);
        return update ? { ...note, order: update.order } : note;
      });
    } catch (error) {
      console.error("Reorder notes error:", error);
      throw error;
    }
  }

  /** @internal */
  updateContent(noteId: string, content: string) {
    for (const [i, note] of this.#notesList.entries()) {
      if (note.id == noteId) this.#notesList[i] = { ...note, content };
    }
  }
}

export const notes = new Notes();
//#endregion

// Loro managers per note
const loroManagers = new SvelteMap<string, LoroNoteManager>();

export async function syncSelectedNote(selectedId: string | undefined) {
  for (const [id, manager] of loroManagers) {
    if (id !== selectedId) {
      manager.stopSync();
    }
  }

  if (!selectedId) {
    return;
  }

  const manager = loroManagers.get(selectedId);
  if (manager) {
    manager.startSync();
    return;
  }

  await getLoroManager(selectedId);
}

// Decrypt note key with user's private key
async function decryptNoteKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  return await decryptKey(encryptedKey, privateKey);
}

// Get or create Loro manager for a note
export async function getLoroManager(
  noteId: string,
): Promise<LoroNoteManager | undefined> {
  // Return existing manager if available
  const preexistingLoroManager = loroManagers.get(noteId);
  if (preexistingLoroManager) return preexistingLoroManager;

  // Find the note
  const note = notes.notesList.find((n) => n.id === noteId);
  if (!note) return undefined;

  const privateKey = auth.userPrivateKey;
  if (!privateKey) {
    console.error("No private key available");
    return undefined;
  }

  try {
    // Decrypt the note's encryption key
    const noteKey = await decryptNoteKey(note.encryptedKey, privateKey);

    // Create Loro manager with auto-save
    const manager = new LoroNoteManager(noteId, noteKey, async (snapshot) => {
      // Auto-save on changes
      const encryptedSnapshot = await manager.getEncryptedSnapshot();
      await notes.updateNote(noteId, encryptedSnapshot);
    });

    // Initialize with encrypted snapshot
    if (note.loroSnapshot) {
      await manager.init(note.loroSnapshot);
    }

    // Update note content
    const content = manager.getContent();
    notes.updateContent(noteId, content);

    loroManagers.set(noteId, manager);

    if (notes.selectedNoteId === noteId) {
      manager.startSync();
    }

    return manager;
  } catch (error) {
    throw new Error("Failed to decrypt note", { cause: error });
  }
}
