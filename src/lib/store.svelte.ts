import { generateNoteKey, encryptKeyForUser, decryptKey } from "$lib/crypto";
import { LoroNoteManager } from "$lib/loro";
import type { NoteOrFolder } from "./schema.ts";

export interface User {
  id: string;
  username: string;
  publicKey?: string;
  privateKeyEncrypted?: string;
}

class NoteStore {
  currentUser = $state<User | null>(null);
  userPrivateKey = $state<string | null>(null);
  notes = $state<NoteOrFolder[]>([]);
  selectedNoteId = $state<string | null>(null);
  editorMode = $state<"prosemark" | "milkdown">("prosemark");

  // Loro managers per note
  private loroManagers = new Map<string, LoroNoteManager>();

  constructor() {
    // Subscribe to selected note changes to manage sync
    $effect.root(() => {
      $effect(() => {
        // Stop sync for all other managers
        this.loroManagers.forEach((manager, id) => {
          if (id !== this.selectedNoteId) {
            manager.stopSync();
          }
        });

        // Start sync for selected note
        if (this.selectedNoteId) {
          const manager = this.loroManagers.get(this.selectedNoteId);
          if (manager) {
            manager.startSync();
          } else {
            // Manager might not be created yet, getLoroManager will handle it
            this.getLoroManager(this.selectedNoteId);
          }
        }
      });
    });
  }

  // Derived note tree for sidebar
  get noteTree() {
    const map = new Map();
    const roots: NoteOrFolder[] = [];

    // First pass: create map entries
    this.notes.forEach((note) => {
      map.set(note.id, { ...note, children: [] });
    });

    // Second pass: build tree
    this.notes.forEach((note) => {
      if (note.parentId) {
        const parent = map.get(note.parentId);
        if (parent) {
          parent.children.push(map.get(note.id));
        } else {
          // Parent not found (maybe deleted?), treat as root or orphan
          roots.push(map.get(note.id));
        }
      } else {
        roots.push(map.get(note.id));
      }
    });

    // Recursive function to sort children at all levels
    const sortChildren = (items: any[]) => {
      items.sort((a, b) => a.order - b.order);
      items.forEach((item) => {
        if (item.children && item.children.length > 0) {
          sortChildren(item.children);
        }
      });
    };

    sortChildren(roots);
    return roots;
  }

  selectNote(noteId: string) {
    this.selectedNoteId = noteId;
  }

  setCurrentUser(user: User) {
    this.currentUser = user;
  }

  setUserPrivateKey(privateKey: string) {
    // Handle double-encoded keys (TUlJ... -> MII...)
    // This can happen if the key was base64 encoded twice
    if (privateKey.startsWith("TUlJ")) {
      try {
        const decoded = atob(privateKey);
        if (decoded.startsWith("MII")) {
          console.log("Detected double-encoded private key, fixing...");
          this.userPrivateKey = decoded;
          return;
        }
      } catch (e) {
        console.warn("Failed to attempt double-encoding fix:", e);
      }
    }
    this.userPrivateKey = privateKey;
  }

  // Load user notes from API
  async loadNotes() {
    try {
      const res = await fetch("/api/notes", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load notes");

      const data = await res.json();
      this.notes = data.notes.map((n: any) => ({
        ...n,
        content: "", // Will be decrypted when selected
        order: n.order ?? 0,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }));
    } catch (error) {
      console.error("Load notes error:", error);
    }
  }

  // Decrypt note key with user's private key
  private async decryptNoteKey(
    encryptedKey: string,
    privateKey: string,
  ): Promise<string> {
    return await decryptKey(encryptedKey, privateKey);
  }

  // Get or create Loro manager for a note
  async getLoroManager(noteId: string): Promise<LoroNoteManager | null> {
    // Return existing manager if available
    if (this.loroManagers.has(noteId)) {
      return this.loroManagers.get(noteId)!;
    }

    // Find the note
    const note = this.notes.find((n) => n.id === noteId);
    if (!note) return null;

    const privateKey = this.userPrivateKey;
    if (!privateKey) {
      console.error("No private key available");
      return null;
    }

    try {
      console.log("Decrypting note key for:", noteId);
      console.log("Encrypted Key length:", note.encryptedKey?.length);
      console.log("Private Key length:", privateKey?.length);
      // Decrypt the note's encryption key
      const noteKey = await this.decryptNoteKey(note.encryptedKey, privateKey);

      // Create Loro manager with auto-save
      console.log("Creating LoroNoteManager for:", noteId);
      const manager = new LoroNoteManager(noteId, noteKey, async (snapshot) => {
        // Auto-save on changes
        const encryptedSnapshot = await manager.getEncryptedSnapshot();
        await this.apiUpdateNote(noteId, encryptedSnapshot);
      });

      // Initialize with encrypted snapshot
      if (note.loroSnapshot) {
        console.log("Initializing manager with snapshot for:", noteId);
        await manager.init(note.loroSnapshot);
      } else {
        console.log("No snapshot for note:", noteId);
      }

      // Update note content
      const content = manager.getContent();
      this.notes = this.notes.map((note) =>
        note.id === noteId ? { ...note, content } : note,
      );

      this.loroManagers.set(noteId, manager);

      // Start sync if this is the selected note
      if (this.selectedNoteId === noteId) {
        console.log("Starting sync for:", noteId);
        manager.startSync();
      }

      console.log("Returning new manager for:", noteId);
      return manager;
    } catch (error) {
      console.error("Failed to decrypt note:", error);
      return null;
    }
  }

  // Create new note with encryption
  async createNote(
    title: string = "Untitled Note",
    parentId: string | null = null,
    isFolder = false,
  ) {
    try {
      const user = this.currentUser;
      console.log("createNote called, user:", user);

      if (!user) {
        throw new Error("No user logged in");
      }

      if (!user.publicKey) {
        console.error("User object:", JSON.stringify(user));
        throw new Error("No user public key");
      }

      // Generate AES key for the note
      const noteKey = await generateNoteKey();

      // Encrypt note key with user's public key
      const encryptedKey = await encryptKeyForUser(noteKey, user.publicKey);

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, encryptedKey, parentId, isFolder }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create note");
      }

      const data = await res.json();
      const newNote = {
        ...data.note,
        content: "",
        createdAt: new Date(data.note.createdAt),
        updatedAt: new Date(data.note.updatedAt),
      };

      this.notes = [...this.notes, newNote];
      this.selectedNoteId = newNote.id;

      // Create Loro manager for the new note
      if (!isFolder) {
        await this.getLoroManager(newNote.id);
      }

      return newNote;
    } catch (error) {
      console.error("Create note error:", error);
      throw error;
    }
  }

  // Create folder (wrapper for createNote)
  async createFolder(
    title: string = "New Folder",
    parentId: string | null = null,
  ) {
    return await this.createNote(title, parentId, true);
  }

  // Delete note
  async deleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete note");

      this.notes = this.notes.filter((note) => note.id !== noteId);

      // Clear selection if deleted note was selected
      if (this.selectedNoteId === noteId) {
        this.selectedNoteId = null;
      }

      // Clean up Loro manager
      const manager = this.loroManagers.get(noteId);
      if (manager) {
        manager.stopSync();
        this.loroManagers.delete(noteId);
      }
    } catch (error) {
      console.error("Delete note error:", error);
      throw error;
    }
  }

  // Update note content (wrapper for updating specific fields)
  async updateNoteContent(noteId: string, title?: string, content?: string) {
    if (title !== undefined) {
      await this.updateNoteTitle(noteId, title);
    }
    if (content !== undefined) {
      const manager = this.loroManagers.get(noteId);
      if (manager) {
        manager.updateContent(content);
      }
    }
  }

  // Update note title
  async updateNoteTitle(noteId: string, title: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) throw new Error("Failed to update note");

      this.notes = this.notes.map((note) =>
        note.id === noteId ? { ...note, title } : note,
      );
    } catch (error) {
      console.error("Update note title error:", error);
      throw error;
    }
  }

  // Move note to folder (update parentId)
  async moveNoteToFolder(noteId: string, newParentId: string | null) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: newParentId }),
      });

      if (!res.ok) throw new Error("Failed to move note");

      this.notes = this.notes.map((note) =>
        note.id === noteId ? { ...note, parentId: newParentId } : note,
      );
    } catch (error) {
      console.error("Move note error:", error);
      throw error;
    }
  }

  // Helper function for API updates
  private async apiUpdateNote(noteId: string, loroSnapshot: string) {
    try {
      console.log(
        "Saving snapshot for note:",
        noteId,
        "length:",
        loroSnapshot.length,
      );
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loroSnapshot }),
      });
      console.log("Snapshot saved successfully for:", noteId);
    } catch (error) {
      console.error("API update error:", error);
    }
  }

  // Reorder notes
  async reorderNotes(updates: Array<{ id: string; order: number }>) {
    try {
      const res = await fetch("/api/notes/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error("Failed to reorder notes");

      // Update local state
      this.notes = this.notes.map((note) => {
        const update = updates.find((u) => u.id === note.id);
        return update ? { ...note, order: update.order } : note;
      });
    } catch (error) {
      console.error("Reorder notes error:", error);
      throw error;
    }
  }
}

export const store = new NoteStore();
