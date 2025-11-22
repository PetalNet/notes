import { generateNoteKey, encryptKeyForUser, decryptKey } from "$lib/crypto";
import { LoroNoteManager } from "$lib/loro";
import { Order } from "effect";
import { getNotes } from "./remote/notes.remote.ts";
import type { Folder, Note, NoteOrFolder } from "./schema.ts";
import { page } from "$app/state";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { createSubscriber, SvelteMap } from "svelte/reactivity";

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
//#endregion

//#region Notes

export class Notes {
  #notesList = $state<NoteOrFolder[]>([]);

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

  #subscribe;

  constructor() {
    this.#subscribe = createSubscriber((update) => {
      // const selectedId = page.params.id;
      // // Stop sync for all other managers
      // for (const [id, manager] of loroManagers) {
      //   if (id !== selectedId) {
      //     manager.stopSync();
      //   }
      // }
      // if (!selectedId) return;
      // const manager = loroManagers.get(selectedId);
      // if (manager) {
      //   manager.startSync();
      // } else {
      //   // Manager might not exist yet; creation will start sync once ready
      //   getLoroManager(selectedId).then(update);
      // }
      // return () => {
      //   loroManagers.get(selectedId)?.stopSync();
      // };
    });
  }

  get notesList(): NoteOrFolder[] {
    this.#subscribe();

    return this.#notesList;
  }
  get notesTree(): TreeNode[] {
    return this.#notesTree;
  }

  /** Load current user's notes from the API. */
  async load(): Promise<void> {
    // TODO: Why do we waterfall? Shouldn't we SSR this?
    this.#notesList = await getNotes();
  }

  /** Create new note with encryption. */
  async createNote<IsFolder extends boolean>(
    title: string,
    parentId: string | null,
    isFolder: IsFolder,
    publicKey: string,
  ): Promise<
    IsFolder extends true
      ? Folder
      : IsFolder extends false
        ? Note
        : NoteOrFolder
  > {
    try {
      console.log("createNote called");

      // Generate AES key for the note
      const noteKey = await generateNoteKey();

      // Encrypt note key with user's public key
      const encryptedKey = await encryptKeyForUser(noteKey, publicKey);

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, encryptedKey, parentId, isFolder }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error ?? "Failed to create note");
      }

      const data = await res.json();
      const newNote = {
        ...data.note,
        content: "",
        createdAt: new Date(data.note.createdAt),
        updatedAt: new Date(data.note.updatedAt),
      };

      this.#notesList = [...notesList, newNote];
      goto(resolve("/notes/[id]", { id: newNote.id }));

      // Create Loro manager for the new note
      if (!isFolder) {
        await getLoroManager(newNote.id);
      }

      return newNote;
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
  async deleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete note");

      this.#notesList = this.#notesList.filter((note) => note.id !== noteId);

      // Clear selection if deleted note was selected
      if (page.data.id === noteId) {
        goto(resolve("/"));
      }

      // Clean up Loro manager
      const manager = loroManagers.get(noteId);
      if (manager) {
        manager.stopSync();
        loroManagers.delete(noteId);
      }
    } catch (error) {
      console.error("Delete note error:", error);
      throw error;
    }
  }
  /** Update note content (wrapper for updating specific fields). */
  async updateNoteContent(noteId: string, title?: string, content?: string) {
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
  async updateNoteTitle(noteId: string, title: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) throw new Error("Failed to update note");

      this.#notesList = this.#notesList.map((note) =>
        note.id === noteId ? { ...note, title } : note,
      );
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }
  /** Move note to folder (update parentId). */
  async moveNoteToFolder(noteId: string, newParentId: string | null) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: newParentId }),
      });

      if (!res.ok) throw new Error("Failed to move note");

      this.#notesList = this.#notesList.map((note) =>
        note.id === noteId ? { ...note, parentId: newParentId } : note,
      );
    } catch (error) {
      console.error("Move note error:", error);
      throw error;
    }
  }
  /** Helper function for API updates. */
  async apiUpdateNote(noteId: string, loroSnapshot: string) {
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loroSnapshot }),
      });
    } catch (error) {
      console.error("API update error:", error);
    }
  }
  /** Reorder notes. */
  async reorderNotes(updates: Array<{ id: string; order: number }>) {
    try {
      const res = await fetch("/api/notes/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error("Failed to reorder notes");

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
  if (loroManagers.has(noteId)) {
    return loroManagers.get(noteId)!;
  }

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
      await notes.apiUpdateNote(noteId, encryptedSnapshot);
    });

    // Initialize with encrypted snapshot
    if (note.loroSnapshot) {
      await manager.init(note.loroSnapshot);
    }

    // Update note content
    const content = manager.getContent();
    notes.updateContent(noteId, content);

    loroManagers.set(noteId, manager);

    manager.startSync();

    return manager;
  } catch (error) {
    console.error("Failed to decrypt note:", error);
    return undefined;
  }
}
