<script lang="ts">
  import { onMount } from "svelte";
  import { notes } from "$lib/store.svelte.ts";
  import { fade } from "svelte/transition";
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
  } from "@lucide/svelte";
  import type { User } from "$lib/schema.ts";
  import ProfilePicture from "./ProfilePicture.svelte";

  interface ContextState {
    x: number;
    y: number;
    noteId: string;
    isFolder: boolean;
  }

  interface Props {
    user: User | undefined;
  }

  let { user }: Props = $props();
  let expandedFolders = new SvelteSet<string>();
  let renamingId = $state<string | null>(null);
  let renameTitle = $state("");
  let contextMenu = $state<ContextState>();

  let rootContainer: HTMLElement;
  let isRootDropTarget = $state(false);

  // Set up root drop target
  onMount(() => {
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
        const sourceId = source.data.id as string;
        const sourceParentId = source.data.parentId as string | null;

        // Move to root if it's not already there
        if (sourceParentId !== null) {
          void notes.moveNoteToFolder(sourceId, null);
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
    await notes.updateNoteTitle(renamingId, renameTitle);
    renamingId = null;
    closeContextMenu();
  }

  function startRename(noteId: string, currentTitle: string) {
    renamingId = noteId;
    renameTitle = currentTitle;
    closeContextMenu();
  }

  async function handleDelete(noteId: string) {
    if (confirm("Are you sure you want to delete this note?")) {
      await notes.deleteNote(noteId);
    }
    closeContextMenu();
  }

  // Close context menu on click outside
  function onWindowClick() {
    closeContextMenu();
  }

  // Handle reordering at root level
  async function handleRootReorder(sourceId: string, targetIndex: number) {
    const rootItems = notes.notesTree;
    const sourceIndex = rootItems.findIndex((item) => item.id === sourceId);

    let adjustedTargetIndex = targetIndex;
    // If moving down in the same list, decrement target index because removal shifts items
    if (sourceIndex !== -1 && sourceIndex < targetIndex) {
      adjustedTargetIndex -= 1;
    }

    const updates = rootItems
      .filter((item) => item.id !== sourceId)
      .toSpliced(
        adjustedTargetIndex,
        0,
        rootItems.find((item) => item.id === sourceId)!,
      )
      .map((item, i) => ({ id: item.id, order: i }));

    await notes.reorderNotes(updates);
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="flex h-full w-64 flex-col border-r border-base-content/10">
  <!-- User Header -->
  <div
    class="flex items-center justify-between border-b border-base-content/10 p-4"
  >
    <div class="flex items-center gap-2">
      <ProfilePicture name={user?.username ?? "A"} />
      <span class="max-w-[100px] truncate text-sm font-medium"
        >{user?.username ?? "Anonymous"}</span
      >
    </div>
    <form action="?/logout" method="POST">
      <button
        type="submit"
        class="text-xs text-base-content/40 transition-colors hover:text-base-content/60"
      >
        Log out
      </button>
    </form>
  </div>

  <!-- Actions -->
  <div class="grid grid-cols-2 gap-2 p-3">
    <button
      onclick={async () => {
        if (user === undefined) {
          throw new Error("Cannot create note whilst logged out.");
        }

        await notes.createNote("Untitled Note", null, false, user.publicKey);
      }}
      class="btn"><FilePlus /> Note</button
    >
    <button
      onclick={async () => {
        if (user === undefined) {
          throw new Error("Cannot create folder whilst logged out.");
        }

        await notes.createFolder("New Folder", null, user.publicKey);
      }}
      class="btn"><FolderPlus /> Folder</button
    >
  </div>

  <!-- Note Tree -->
  <div
    bind:this={rootContainer}
    class={[
      "flex-1 space-y-0.5 overflow-y-auto px-2 py-2 transition-all",
      isRootDropTarget && "bg-indigo-50 ring-2 ring-indigo-400 ring-inset",
    ]}
  >
    {#each notes.notesTree as item, idx (item.id)}
      <TreeItem
        {item}
        {expandedFolders}
        {toggleFolder}
        {handleContextMenu}
        index={idx}
        onReorder={handleRootReorder}
      />
    {/each}

    <!-- Empty state -->
    {#if notes.notesTree.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <File />
        <p class="text-sm text-slate-400">No notes yet</p>
        <p class="mt-1 text-xs text-slate-300">
          Create your first note to get started
        </p>
      </div>
    {/if}
  </div>
</div>

<!-- Context Menu -->
{#if contextMenu}
  {@const clickedId = contextMenu.noteId}
  <div
    class="animate-in fade-in zoom-in-95 fixed z-50 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg duration-100"
    style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
  >
    {#if contextMenu.isFolder}
      <button
        class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
        onclick={() => {
          if (user === undefined) {
            throw new Error("Cannot create note whilst logged out.");
          }

          void notes.createNote(
            "Untitled Note",
            clickedId,
            false,
            user.publicKey,
          );
          closeContextMenu();
        }}><Plus /> New Note Inside</button
      >
    {/if}

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
      onclick={() => {
        const noteToRename = notes.notesList.find((n) => n.id === clickedId);
        if (noteToRename) {
          startRename(noteToRename.id, noteToRename.title);
        }
      }}
    >
      <Pencil />
      Rename
    </button>

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
      onclick={() => handleDelete(clickedId)}
    >
      <Trash2 />
      Delete
    </button>
  </div>
{/if}

<!-- Rename Modal -->
{#if renamingId}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
      transition:fade={{ duration: 200 }}
    >
      <h3 class="mb-4 text-lg font-semibold text-slate-800">Rename</h3>
      <input
        type="text"
        bind:value={renameTitle}
        class="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        placeholder="Enter new name..."
        onkeydown={async (e) => {
          if (e.key === "Enter") {
            await handleRename();
          } else if (e.key === "Escape") {
            renamingId = null;
          }
        }}
      />
      <div class="mt-6 flex justify-end gap-2">
        <button
          onclick={() => (renamingId = null)}
          class="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onclick={handleRename}
          class="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Save Changes
        </button>
      </div>
    </div>
  </div>
{/if}
