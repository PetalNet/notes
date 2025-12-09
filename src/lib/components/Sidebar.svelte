<script lang="ts">
  import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
  import TreeItem from "./TreeItem.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    FolderPlus,
    FilePlus,
    File,
    Plus,
    Trash2,
    Pencil,
    PanelLeftClose,
    LogOut,
    Globe,
    Users,
  } from "@lucide/svelte";
  import type { User } from "$lib/schema.ts";
  import ProfilePicture from "./ProfilePicture.svelte";
  import { unawaited } from "$lib/unawaited.ts";
  import {
    createNote,
    deleteNote,
    updateNote,
    reorderNotes,
    getNotes,
    type SharedNote,
  } from "$lib/remote/notes.remote.ts";
  import { buildNotesTree } from "$lib/utils/tree.ts";
  import { generateNoteKey, encryptKeyForUser } from "$lib/crypto";
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import type { NoteOrFolder } from "$lib/schema.ts";
  import { page } from "$app/state";

  interface ContextState {
    x: number;
    y: number;
    noteId: string;
    isFolder: boolean;
  }

  import ConfirmationModal from "./ConfirmationModal.svelte";

  interface Props {
    user: User | undefined;
    notesList: NoteOrFolder[];
    sharedNotes?: SharedNote[];
    isCollapsed: boolean;
    toggleSidebar: () => void;
  }

  let {
    user,
    notesList,
    sharedNotes = [],
    isCollapsed,
    toggleSidebar,
  }: Props = $props();
  let expandedFolders = new SvelteSet<string>();
  let showSharedNotes = $state(true);
  let renamingId = $state<string | null>(null);
  let renameTitle = $state("");
  let contextMenu = $state<ContextState>();
  let renameModal: HTMLDialogElement;
  let noteToDeleteId = $state<string | null>(null);

  let notesTree = $derived(
    buildNotesTree(notesList.filter((n) => n.ownerId === user?.id)),
  );

  let rootContainer = $state<HTMLElement>();
  let isRootDropTarget = $state(false);

  // Set up root drop target
  // Set up root drop target
  $effect(() => {
    if (!rootContainer) return;

    const cleanup = dropTargetForElements({
      element: rootContainer,
      onDragEnter: () => {
        isRootDropTarget = true;
      },
      onDragLeave: () => {
        isRootDropTarget = false;
      },
      onDrop: ({ source }) => {
        isRootDropTarget = false;
        // TODO: make this typesafe
        const sourceId = source.data["id"] as string;
        const sourceParentId = source.data["parentId"] as string | null;

        // Move to root if it's not already there
        if (sourceParentId !== null) {
          unawaited(
            (async () => {
              await updateNote({ noteId: sourceId, parentId: null }).updates(
                getNotes().withOverride((notes) =>
                  notes.map((note) =>
                    note.id === sourceId ? { ...note, parentId: null } : note,
                  ),
                ),
              );
            })(),
          );
        }
      },
    });

    return cleanup;
  });

  function toggleFolder(folderId: string) {
    if (expandedFolders.has(folderId)) {
      expandedFolders.delete(folderId);
    } else {
      expandedFolders.add(folderId);
    }
  }

  function handleContextMenu(e: MouseEvent, noteId: string, isFolder: boolean) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, noteId, isFolder };
  }

  function closeContextMenu() {
    contextMenu = undefined;
  }

  async function handleRename() {
    if (!renamingId) return;
    await updateNote({ noteId: renamingId, title: renameTitle }).updates(
      getNotes().withOverride((notes) =>
        notes.map((note) =>
          note.id === renamingId ? { ...note, title: renameTitle } : note,
        ),
      ),
    );
    renamingId = null;
    closeContextMenu();
  }

  function startRename(noteId: string, currentTitle: string) {
    renamingId = noteId;
    renameTitle = currentTitle;
    closeContextMenu();
  }

  function handleDelete(noteId: string) {
    noteToDeleteId = noteId;
    closeContextMenu();
  }

  async function confirmDelete() {
    if (!noteToDeleteId) return;

    const id = noteToDeleteId;
    noteToDeleteId = null; // Close modal immediately

    await deleteNote(id).updates(
      getNotes().withOverride((notes) =>
        notes.filter((note) => note.id !== id),
      ),
    );

    if (page.params.id === id) {
      goto(`${base}/`);
    }
  }

  // Close context menu on click outside
  function onWindowClick() {
    closeContextMenu();
  }

  // Handle reordering at root level
  async function handleRootReorder(sourceId: string, targetIndex: number) {
    const rootItems = notesTree;
    const itemToMove = notesList.find((n) => n.id === sourceId);

    if (!itemToMove) return;

    const updates = rootItems
      .filter((item) => item.id !== sourceId)
      .toSpliced(targetIndex, 0, { ...itemToMove, children: [] })
      .map((item, i) => ({ id: item.id, order: i }));

    await reorderNotes(updates).updates(
      // TODO: add optimistic update.
      getNotes(),
    );
  }

  async function handleCreateNote(
    title: string,
    parentId: string | null,
    isFolder: boolean,
    publicKey: string,
  ) {
    // Generate AES key for the note
    const noteKey = await generateNoteKey();

    // Encrypt note key with user's public key
    const encryptedKey = await encryptKeyForUser(noteKey, publicKey);

    // Encrypt note key for Server (Broker Escrow)
    let serverEncryptedKey = "";
    try {
      const res = await fetch(`${base}/api/server-identity`);
      if (res.ok) {
        const identity = await res.json();
        // Use the dedicated Encryption Key (X25519)
        if (identity.encryptionPublicKey) {
          serverEncryptedKey = await encryptKeyForUser(
            noteKey,
            identity.encryptionPublicKey,
          );
        } else {
          console.warn(
            "Server identity missing encryption key. Auto-join will not work.",
          );
        }
      }
    } catch (e) {
      console.error("Failed to fetch server identity for key escrow:", e);
    }

    const newNote = await createNote({
      title,
      encryptedKey,
      serverEncryptedKey,
      parentId,
      isFolder,
    }).updates(
      // TODO: add optimistic update.
      getNotes(),
    );

    if (!isFolder) {
      goto(`${base}/notes/${newNote.id}`);
    }
  }

  // Silent Migration: Escrow keys for legacy notes
  $effect(() => {
    if (!user || !user.privateKeyEncrypted || !user.publicKey) return;

    unawaited(
      (async () => {
        // Find notes that need migration (owned by us, missing serverEncryptedKey)
        const notesToMigrate = notesList.filter(
          (n) =>
            n.ownerId === user.id && !n.serverEncryptedKey && n.encryptedKey,
        );

        if (notesToMigrate.length === 0) return;

        console.log(
          `[Escrow] Found ${notesToMigrate.length} notes needing key escrow migration.`,
        );

        // Fetch Server Identity Key
        let serverIdentityKey = "";
        try {
          const res = await fetch(`${base}/api/server-identity`);
          if (res.ok) {
            const identity = await res.json();
            serverIdentityKey = identity.encryptionPublicKey;
          }
        } catch {
          /* ignore */
        }

        if (!serverIdentityKey) return;

        const { decryptKey } = await import("$lib/crypto");

        for (const note of notesToMigrate) {
          try {
            // 1. Decrypt Note Key
            const noteKey = await decryptKey(
              note.encryptedKey,
              user.privateKeyEncrypted,
            );
            // 2. Encrypt for Server
            const serverEncryptedKey = await encryptKeyForUser(
              noteKey,
              serverIdentityKey,
            );
            // 3. Upload (using a unified update endpoint? notes.remote doesn't have one for keys yet)
            // We need to extend updateNote to support serverEncryptedKey.
            // For now, let's assume we update the schema first.
            await updateNote({ noteId: note.id, serverEncryptedKey }).updates(
              getNotes(),
            );
            console.log(`[Escrow] Migrated note ${note.id}`);
          } catch (e) {
            console.error(`[Escrow] Failed to migrate note ${note.id}`, e);
          }
        }
      })(),
    );
  });

  $effect(() => {
    if (renamingId && !renameModal.open) {
      renameModal.showModal();
    } else if (!renamingId && renameModal.open) {
      renameModal.close();
    }
  });
</script>

<svelte:window onclick={onWindowClick} />

<div
  class="sidebar flex h-full flex-col border-r border-base-content/10 transition-all duration-300 [view-transition-name:sidebar]"
  style="width: {isCollapsed ? '0' : '16rem'}"
>
  {#if !isCollapsed}
    <!-- User Header -->
    <div
      class="flex items-center justify-between border-b border-base-content/10 p-4"
    >
      <div class="dropdown dropdown-bottom">
        <div
          tabindex="0"
          role="button"
          class="btn h-auto min-h-0 gap-3 rounded-lg px-3 py-2 normal-case btn-ghost hover:bg-base-200"
        >
          <ProfilePicture name={user?.username ?? "A"} />
          <span class="max-w-[120px] truncate text-sm font-semibold">
            {user?.username ?? "Anonymous"}
          </span>
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <ul
          tabindex="0"
          class="dropdown-content menu z-1 w-52 rounded-box bg-base-100 p-2 shadow"
        >
          <li>
            <form action="/logout" method="POST" class="w-full">
              <button type="submit" class="flex w-full items-center gap-2">
                <LogOut size={16} />
                Log out
              </button>
            </form>
          </li>
        </ul>
      </div>

      <button
        onclick={toggleSidebar}
        class="btn btn-square btn-ghost btn-sm"
        title="Collapse sidebar (Ctrl+B)"
      >
        <PanelLeftClose size={20} />
      </button>
    </div>

    <!-- Actions -->
    <div class="grid grid-cols-2 gap-2 p-3">
      <button
        onclick={async () => {
          if (user === undefined) {
            throw new Error("Cannot create note whilst logged out.");
          }

          // Use empty string as fallback for publicKey if null (though it should be set)
          await handleCreateNote(
            "Untitled Note",
            null,
            false,
            user.publicKey || "",
          );
        }}
        class="btn"><FilePlus /> Note</button
      >
      <button
        onclick={async () => {
          if (user === undefined) {
            throw new Error("Cannot create folder whilst logged out.");
          }

          await handleCreateNote(
            "New Folder",
            null,
            true,
            user.publicKey || "",
          );
        }}
        class="btn"><FolderPlus /> Folder</button
      >
    </div>

    <!-- Shared with me -->
    {#if sharedNotes.length > 0}
      <div class="px-2 pb-2">
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-base-content/70 hover:bg-base-content/5 hover:text-base-content"
          onclick={() => (showSharedNotes = !showSharedNotes)}
        >
          {#if showSharedNotes}
            <ChevronRight class="rotate-90 transition-transform" size={16} />
          {:else}
            <ChevronRight class="transition-transform" size={16} />
          {/if}
          <Globe size={16} />
          <span>Shared with me</span>
        </button>

        {#if showSharedNotes}
          <div class="mt-1 space-y-0.5 pl-4">
            {#each sharedNotes as note (note.id)}
              <a
                href={`${base}/notes/${note.id}`}
                class="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-base-content/70 hover:bg-base-content/5 hover:text-base-content {page
                  .params.id === note.id
                  ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                  : ''}"
              >
                <div class=" text-primary"><File size={16} /></div>
                <div class="flex flex-1 flex-col overflow-hidden">
                  <span class="truncate">{note.title || "Untitled"}</span>
                  <span class="truncate text-[10px] opacity-60"
                    >from {note.hostServer}</span
                  >
                </div>
              </a>
            {/each}
          </div>
        {/if}
      </div>
      <div class="mx-2 my-1 border-t border-base-content/10"></div>
    {/if}

    <!-- Note Tree -->
    <div
      bind:this={rootContainer}
      class="flex-1 overflow-y-auto px-2 pb-2"
      role="tree"
      itemscope
    >
      {#each notesTree as note, idx (note.id)}
        <TreeItem
          item={note}
          {expandedFolders}
          {toggleFolder}
          {handleContextMenu}
          {notesList}
          {notesTree}
          index={idx}
          onReorder={handleRootReorder}
        />
      {/each}

      <!-- Empty state -->
      {#if notesTree.length === 0}
        <div
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <File />
          <p class="text-sm text-base-content">No notes yet</p>
          <p class="mt-1 text-xs text-base-content/75">
            Create your first note to get started
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Context Menu -->
{#if contextMenu}
  {@const clickedId = contextMenu.noteId}
  <div
    class="animate-in fade-in zoom-in-95 fixed z-50 w-48 rounded-lg border bg-base-300 py-1 duration-100"
    style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
  >
    {#if contextMenu.isFolder}
      <button
        class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-base-content hover:bg-primary hover:text-primary-content"
        onclick={() => {
          if (user === undefined) {
            throw new Error("Cannot create note whilst logged out.");
          }

          unawaited(
            handleCreateNote(
              "An Untitled Note",
              clickedId,
              false,
              user.publicKey || "",
            ),
          );
          closeContextMenu();
        }}><Plus /> New Note Inside</button
      >
    {/if}

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-base-content hover:bg-primary hover:text-primary-content"
      onclick={() => {
        const noteToRename = notesList.find((n) => n.id === clickedId);
        if (noteToRename) {
          startRename(noteToRename.id, noteToRename.title);
        }
      }}
    >
      <Pencil />
      Rename
    </button>

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-error hover:bg-error hover:text-error-content"
      onclick={() => handleDelete(clickedId)}
    >
      <Trash2 />
      Delete
    </button>
  </div>
{/if}

<!-- Rename Modal -->
<dialog
  class="modal"
  bind:this={renameModal}
  onclose={() => (renamingId = null)}
>
  <div class="modal-box">
    <h3 class="mb-4 text-lg font-semibold text-primary">Rename</h3>
    <input
      type="text"
      bind:value={renameTitle}
      class="input w-full focus:outline-none"
      placeholder="Enter new name..."
      onkeydown={async (e) => {
        if (e.key === "Enter") {
          await handleRename();
        }
      }}
    />
    <div class="modal-action">
      <button onclick={() => (renamingId = null)} class="btn"> Cancel </button>
      <button onclick={handleRename} class="btn btn-primary">
        Save Changes
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
  isOpen={!!noteToDeleteId}
  title="Delete Note"
  message="Are you sure you want to delete this note? This action cannot be undone."
  type="danger"
  confirmText="Delete"
  onConfirm={confirmDelete}
  onCancel={() => (noteToDeleteId = null)}
/>
