import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { decryptKey, encryptKeyForUser, generateNoteKey } from "$lib/crypto";
import { LoroNoteManager } from "$lib/loro";
import * as notesApi from "$lib/remote/notes.remote.ts";
import type { ReorderNotes } from "$lib/remote/notes.schemas.ts";
import type { Folder, Note, NoteOrFolder } from "$lib/schema.ts";
import { Order } from "effect";
import { SvelteMap } from "svelte/reactivity";
import { unawaited } from "./unawaited.ts";

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

//#region Notes
type MaybeFolder<IsFolder extends boolean> = IsFolder extends true
  ? Folder
  : IsFolder extends false
    ? Note
    : NoteOrFolder;

export class Notes {
  userPrivateKey = $state<string>();
  notesList = $state<NoteOrFolder[]>([]);
  selectedNoteId = $derived(page.params.id);

  /** Loro managers per note. */
  #loroManagers = new SvelteMap<string, LoroNoteManager>();

  constructor() {
    // Subscribe to selected note changes to manage sync
    $effect.root(() => {
      $effect(() => {
        const noteId = this.selectedNoteId;
        if (!noteId) return;

        const manager = this.#loroManagers.get(noteId);
        if (manager) {
          manager.startSync();
        } else {
          // Manager might not be created yet, getLoroManager will handle it
          unawaited(this.getLoroManager(noteId));
        }

        return () => {
          this.#loroManagers.get(noteId)?.stopSync();
        };
      });
    });
  }

  /** Derived note tree for sidebar. */
  notesTree = $derived.by(() => {
    console.log("Recalculating note tree");

    const map = new SvelteMap<string, TreeNode>();
    const roots: TreeNode[] = [];

    // First pass: create map entries
    for (const note of this.notesList) {
      map.set(note.id, { ...note, children: [] });
    }

    // Second pass: build tree
    for (const note of this.notesList) {
      const current = map.get(note.id)!;

      if (note.parentId) {
        const parent = map.get(note.parentId);
        if (parent) {
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

  /** Load current user's notes from the API. */
  async load(): Promise<void> {
    // TODO: Why do we waterfall? Shouldn't we SSR this?
    this.notesList = await notesApi.getNotes();
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

      this.notesList.push(newNote);
      goto(resolve("/notes/[id]", { id: newNote.id }));

      // Create Loro manager for the new note
      if (!isFolder) {
        await this.getLoroManager(newNote.id);
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

      this.notesList = this.notesList.filter((note) => note.id !== noteId);

      // Clear selection if deleted note was selected
      if (this.selectedNoteId === noteId) {
        goto(resolve("/"));
      }

      // Clean up Loro manager
      const manager = this.#loroManagers.get(noteId);
      if (manager) {
        manager.destroy();
        this.#loroManagers.delete(noteId);
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
      const manager = this.#loroManagers.get(noteId);
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
      const note = this.notesList.find((n) => n.id === noteId);
      if (note) note.title = newlyUpdatedNote.title;
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Move note to folder (update parentId). */
  async moveNoteToFolder(
    noteId: string,
    newParentId: string | null,
  ): Promise<void> {
    try {
      const newlyUpdatedNote = await notesApi.updateNote({
        noteId,
        parentId: newParentId,
      });

      // TODO: Switch to Effect/Optic?
      const note = this.notesList.find((n) => n.id === noteId);
      if (note) note.parentId = newlyUpdatedNote.parentId;
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Helper function for API updates. */
  async updateNote(noteId: string, loroSnapshot: string): Promise<void> {
    try {
      await notesApi.updateNote({ noteId, loroSnapshot });
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  /** Reorder this. */
  async reorderNotes(updates: ReorderNotes): Promise<void> {
    try {
      await notesApi.reorderNotes(updates);

      // Update local state
      this.notesList = this.notesList.map((note) => {
        const update = updates.find((u) => u.id === note.id);
        return update ? { ...note, order: update.order } : note;
      });
    } catch (error) {
      console.error("Reorder notes error:", error);
      throw error;
    }
  }

  /** @internal */
  updateContent(noteId: string, content: string): void {
    for (const [i, note] of this.notesList.entries()) {
      if (note.id == noteId) this.notesList[i] = { ...note, content };
    }
  }

  async syncSelectedNote(selectedId: string | undefined): Promise<void> {
    for (const [id, manager] of this.#loroManagers) {
      if (id !== selectedId) {
        manager.stopSync();
      }
    }

    if (!selectedId) {
      return;
    }

    const manager = this.#loroManagers.get(selectedId);
    if (manager) {
      manager.startSync();
      return;
    }

    await this.getLoroManager(selectedId);
  }

  // Decrypt note key with user's private key
  async decryptNoteKey(
    encryptedKey: string,
    privateKey: string,
  ): Promise<string> {
    return await decryptKey(encryptedKey, privateKey);
  }

  // Get or create Loro manager for a note
  async getLoroManager(noteId: string): Promise<LoroNoteManager | undefined> {
    // Return existing manager if available
    const preexistingLoroManager = this.#loroManagers.get(noteId);
    if (preexistingLoroManager) return preexistingLoroManager;

    // Find the note
    const note = this.notesList.find((n) => n.id === noteId);
    if (!note) return undefined;

    if (!this.userPrivateKey) {
      console.error("No private key available");
      return undefined;
    }

    try {
      // Decrypt the note's encryption key
      const noteKey = await this.decryptNoteKey(
        note.encryptedKey,
        this.userPrivateKey,
      );

      // Create Loro manager with auto-save
      const manager = new LoroNoteManager(noteId, noteKey, async (snapshot) => {
        await this.updateNote(noteId, snapshot);
      });

      // Initialize with encrypted snapshot
      if (note.loroSnapshot) {
        await manager.init(note.loroSnapshot);
      }

      // Update note content
      const content = manager.getContent();
      this.updateContent(noteId, content);

      this.#loroManagers.set(noteId, manager);

      if (this.selectedNoteId === noteId) {
        manager.startSync();
      }

      return manager;
    } catch (error) {
      throw new Error("Failed to decrypt note", { cause: error });
    }
  }
}

export const notes = new Notes();
//#endregion
