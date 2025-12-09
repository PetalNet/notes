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
  } from "@lucide/svelte";
  import type { User } from "$lib/schema.ts";
  import ProfilePicture from "./ProfilePicture.svelte";
  import { logout } from "$lib/remote/accounts.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import {
    createNote,
    deleteNote,
    updateNote,
    reorderNotes,
    getNotes,
  } from "$lib/remote/notes.remote.ts";
  import { buildNotesTree } from "$lib/utils/tree.ts";
  import { generateNoteKey, encryptKeyForUser } from "$lib/crypto";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import type { NoteOrFolder } from "$lib/schema.ts";
  import { page } from "$app/state";

  interface ContextState {
    x: number;
    y: number;
    noteId: string;
    isFolder: boolean;
  }

  interface Props {
    user: User | undefined;
    notesList: NoteOrFolder[];
    isCollapsed: boolean;
    toggleSidebar: () => void;
  }

  let { user, notesList, isCollapsed, toggleSidebar }: Props = $props();
  let expandedFolders = new SvelteSet<string>();
  let renamingId = $state<string | null>(null);
  let renameTitle = $state("");
  let contextMenu = $state<ContextState>();
  let renameModal: HTMLDialogElement;

  let notesTree = $derived(buildNotesTree(notesList));

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

  async function handleDelete(noteId: string) {
    if (
      // TODO: confirm sucks, use a <dialog>
      confirm("Are you sure you want to delete this note?")
    ) {
      await deleteNote(noteId).updates(
        getNotes().withOverride((notes) =>
          notes.filter((note) => note.id !== noteId),
        ),
      );

      if (page.params.id === noteId) {
        goto(resolve("/"));
      }
    }
    closeContextMenu();
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

    const newNote = await createNote({
      title,
      encryptedKey,
      parentId,
      isFolder,
    }).updates(
      // TODO: add optimistic update.
      getNotes(),
    );

    if (!isFolder) {
      goto(resolve("/notes/[id]", { id: newNote.id }));
    }
  }

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
            <form {...logout} class="w-full">
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

          await handleCreateNote("Untitled Note", null, false, user.publicKey);
        }}
        class="btn"><FilePlus /> Note</button
      >
      <button
        onclick={async () => {
          if (user === undefined) {
            throw new Error("Cannot create folder whilst logged out.");
          }

          await handleCreateNote("New Folder", null, true, user.publicKey);
        }}
        class="btn"><FolderPlus /> Folder</button
      >
    </div>

    <!-- Note Tree -->
    <div
      bind:this={rootContainer}
      class={[
        "flex-1 space-y-1 overflow-y-auto px-2 py-2 transition-all",
        isRootDropTarget && "bg-indigo-50 ring-2 ring-primary ring-inset",
      ]}
    >
      {#each notesTree as item, idx (item.id)}
        <TreeItem
          {item}
          {expandedFolders}
          {toggleFolder}
          {handleContextMenu}
          index={idx}
          onReorder={handleRootReorder}
          {notesList}
          {notesTree}
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
              user.publicKey,
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
