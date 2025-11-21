import { generateNoteKey, encryptKeyForUser, decryptKey } from "$lib/crypto";
import { LoroNoteManager } from "$lib/loro";
import type { NoteOrFolder } from "./schema.ts";

export interface User {
  id: string;
  username: string;
  publicKey?: string;
  privateKeyEncrypted?: string;
}

export function selectNote(noteId: string) {
  selectedNoteId = noteId;
}

export function setCurrentUser(user: User) {
  currentUser = user;
}

export function setUserPrivateKey(privateKey: string) {
  userPrivateKey = privateKey;
}

// Auth state
export let currentUser = $state<User | null>(null);
export let userPrivateKey = $state<string | null>(null);

// Notes state
export let notes = $state<NoteOrFolder[]>([]);
export let selectedNoteId = $state<string | null>(null);

// Loro managers per note
const loroManagers = new Map<string, LoroNoteManager>();

// Derived note tree for sidebar
export const noteTree = $derived.by(() => {
  const map = new Map();
  const roots: NoteOrFolder[] = [];

  // First pass: create map entries
  notes.forEach((note) => {
    map.set(note.id, { ...note, children: [] });
  });

  // Second pass: build tree
  notes.forEach((note) => {
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
});

// Load user notes from API
export async function loadNotes() {
  try {
    const res = await fetch("/api/notes", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load notes");

    const data = await res.json();
    notes = data.notes.map((n) => ({
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
async function decryptNoteKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  return await decryptKey(encryptedKey, privateKey);
}

// Get or create Loro manager for a note
export async function getLoroManager(
  noteId: string,
): Promise<LoroNoteManager | null> {
  // Return existing manager if available
  if (loroManagers.has(noteId)) {
    return loroManagers.get(noteId)!;
  }

  // Find the note
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;

  const privateKey = userPrivateKey;
  if (!privateKey) {
    console.error("No private key available");
    return null;
  }

  try {
    // Decrypt the note's encryption key
    const noteKey = await decryptNoteKey(note.encryptedKey, privateKey);

    // Create Loro manager with auto-save
    const manager = new LoroNoteManager(noteId, noteKey, async (snapshot) => {
      // Auto-save on changes
      const encryptedSnapshot = await manager.getEncryptedSnapshot();
      await apiUpdateNote(noteId, encryptedSnapshot);
    });

    // Initialize with encrypted snapshot
    if (note.loroSnapshot) {
      await manager.init(note.loroSnapshot);
    }

    // Update note content
    const content = manager.getContent();
    notes = notes.map((note) =>
      note.id === noteId ? { ...note, content } : note,
    );

    loroManagers.set(noteId, manager);

    // Start sync if this is the selected note
    if (selectedNoteId === noteId) {
      manager.startSync();
    }

    return manager;
  } catch (error) {
    console.error("Failed to decrypt note:", error);
    return null;
  }
}

// Subscribe to selected note changes to manage sync
$effect(() => {
  // Stop sync for all other managers
  loroManagers.forEach((manager, id) => {
    if (id !== selectedNoteId) {
      manager.stopSync();
    }
  });

  // Start sync for selected note
  if (selectedNoteId) {
    const manager = loroManagers.get(selectedNoteId);
    if (manager) {
      manager.startSync();
    } else {
      // Manager might not be created yet, getLoroManager will handle it
      getLoroManager(selectedNoteId);
    }
  }
});

// Create new note with encryption
export async function createNote(
  title: string = "Untitled Note",
  parentId: string | null = null,
  isFolder = false,
) {
  try {
    const user = currentUser;
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

    notes = [...notes, newNote];
    selectedNoteId = newNote.id;

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

// Create folder (wrapper for createNote)
export async function createFolder(
  title: string = "New Folder",
  parentId: string | null = null,
) {
  return await createNote(title, parentId, true);
}

// Delete note
export async function deleteNote(noteId: string) {
  try {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Failed to delete note");

    notes = notes.filter((note) => note.id !== noteId);

    // Clear selection if deleted note was selected
    if (selectedNoteId === noteId) {
      selectedNoteId = null;
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

// Update note content (wrapper for updating specific fields)
export async function updateNoteContent(
  noteId: string,
  title?: string,
  content?: string,
) {
  if (title !== undefined) {
    await updateNoteTitle(noteId, title);
  }
  if (content !== undefined) {
    const manager = loroManagers.get(noteId);
    if (manager) {
      manager.updateContent(content);
    }
  }
}

// Update note title
export async function updateNoteTitle(noteId: string, title: string) {
  try {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) throw new Error("Failed to update note");

    notes = notes.map((note) =>
      note.id === noteId ? { ...note, title } : note,
    );
  } catch (error) {
    console.error("Update note title error:", error);
    throw error;
  }
}

// Move note to folder (update parentId)
export async function moveNoteToFolder(
  noteId: string,
  newParentId: string | null,
) {
  try {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: newParentId }),
    });

    if (!res.ok) throw new Error("Failed to move note");

    notes = notes.map((note) =>
      note.id === noteId ? { ...note, parentId: newParentId } : note,
    );
  } catch (error) {
    console.error("Move note error:", error);
    throw error;
  }
}

// Helper function for API updates
async function apiUpdateNote(noteId: string, loroSnapshot: string) {
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

// Reorder notes
export async function reorderNotes(
  updates: Array<{ id: string; order: number }>,
) {
  try {
    const res = await fetch("/api/notes/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    if (!res.ok) throw new Error("Failed to reorder notes");

    // Update local state
    notes = notes.map((note) => {
      const update = updates.find((u) => u.id === note.id);
      return update ? { ...note, order: update.order } : note;
    });
  } catch (error) {
    console.error("Reorder notes error:", error);
    throw error;
  }
}
