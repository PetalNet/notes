<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { store } from "$lib/store.svelte.ts";
  import { fade } from "svelte/transition";
  import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
  import TreeItem from "./TreeItem.svelte";

  let { user } = $props();
  let expandedFolders = $state(new Set<string>());
  let renamingId = $state<string | null>(null);
  let renameTitle = $state("");
  let contextMenu = $state<{
    x: number;
    y: number;
    noteId: string;
    isFolder: boolean;
  } | null>(null);

  let rootContainer: HTMLElement;
  let isRootDropTarget = $state(false);

  // Set up root drop target
  onMount(() => {
    if (!rootContainer) return;

    const cleanup = dropTargetForElements({
      element: rootContainer,
      onDragEnter: () => {
        isRootDropTarget = true;
      },
      onDragLeave: () => {
        isRootDropTarget = false;
      },
      onDrop: async ({ source }) => {
        isRootDropTarget = false;
        const sourceId = source.data.id as string;
        const sourceParentId = source.data.parentId as string | null;

        // Move to root if it's not already there
        if (sourceParentId !== null) {
          await store.moveNoteToFolder(sourceId, null);
        }
      },
    });

    return cleanup;
  });

  function toggleFolder(folderId: string) {
    const newSet = new Set(expandedFolders);
    if (newSet.has(folderId)) {
      newSet.delete(folderId);
    } else {
      newSet.add(folderId);
    }
    expandedFolders = newSet;
  }

  function handleContextMenu(e: MouseEvent, noteId: string, isFolder: boolean) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, noteId, isFolder };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function handleRename() {
    if (!renamingId) return;
    await store.updateNoteTitle(renamingId, renameTitle);
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
      await store.deleteNote(noteId);
    }
    closeContextMenu();
  }

  // Close context menu on click outside
  function onWindowClick() {
    closeContextMenu();
  }

  // Handle reordering at root level
  async function handleRootReorder(sourceId: string, targetIndex: number) {
    const rootItems = store.noteTree;
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
    await store.reorderNotes(updates);
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="flex h-full w-64 flex-col border-r border-slate-200 bg-slate-50">
  <!-- User Header -->
  <div
    class="flex items-center justify-between border-b border-slate-200 bg-white p-4"
  >
    <div class="flex items-center gap-2">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600"
      >
        {user.username[0].toUpperCase()}
      </div>
      <span class="max-w-[100px] truncate text-sm font-medium text-slate-700"
        >{user.username}</span
      >
    </div>
    <form action="/logout" method="POST">
      <button
        type="submit"
        class="text-xs text-slate-400 transition-colors hover:text-slate-600"
      >
        Logout
      </button>
    </form>
  </div>

  <!-- Actions -->
  <div class="grid grid-cols-2 gap-2 p-3">
    <button
      onclick={async () => {
        const note = await store.createNote();
        if (note) {
          goto(`/notes/${note.id}`);
        }
      }}
      class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        ></path><path d="M14 2v6h6"></path><path d="M12 18v-6"></path><path
          d="M9 15h6"
        ></path></svg
      >
      Note
    </button>
    <button
      onclick={() => store.createFolder("New Folder")}
      class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path
          d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        ></path><line x1="12" y1="11" x2="12" y2="17"></line><line
          x1="9"
          y1="14"
          x2="15"
          y2="14"
        ></line></svg
      >
      Folder
    </button>
  </div>

  <!-- Note Tree -->
  <div
    bind:this={rootContainer}
    class="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 transition-all"
    class:ring-2={isRootDropTarget}
    class:ring-indigo-400={isRootDropTarget}
    class:ring-inset={isRootDropTarget}
    class:bg-indigo-50={isRootDropTarget}
  >
    {#each store.noteTree as item, idx (item.id)}
      <TreeItem
        {item}
        {expandedFolders}
        {toggleFolder}
        selectNote={(id) => {
          store.selectNote(id);
          goto(`/notes/${id}`);
        }}
        {handleContextMenu}
        index={idx}
        onReorder={handleRootReorder}
      />
    {/each}

    <!-- Empty state -->
    {#if store.noteTree.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mb-3 text-slate-300"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          ></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p class="text-sm text-slate-400">No notes yet</p>
        <p class="mt-1 text-xs text-slate-300">
          Create your first note to get started
        </p>
      </div>
    {/if}
  </div>
  <!-- Editor Mode Toggle -->
  <div class="mt-auto border-t border-slate-200 p-4">
    <div class="flex items-center justify-between rounded-lg bg-slate-100 p-1">
      <button
        class="flex-1 cursor-pointer rounded-md py-1 text-xs font-medium transition-all {store.editorMode ===
        'prosemark'
          ? 'bg-white text-indigo-600 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'}"
        onclick={() => (store.editorMode = "prosemark")}
      >
        Prosemark
      </button>
      <button
        class="flex-1 cursor-pointer rounded-md py-1 text-xs font-medium transition-all {store.editorMode ===
        'milkdown'
          ? 'bg-white text-indigo-600 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'}"
        onclick={() => (store.editorMode = "milkdown")}
      >
        Milkdown
      </button>
    </div>
  </div>
</div>

<!-- Context Menu -->
{#if contextMenu}
  <div
    class="animate-in fade-in zoom-in-95 fixed z-50 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg duration-100"
    style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
  >
    {#if contextMenu.isFolder}
      <button
        class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
        onclick={async () => {
          const note = await store.createNote(
            "Untitled Note",
            contextMenu!.noteId,
          );
          if (note) {
            goto(`/notes/${note.id}`);
          }
          closeContextMenu();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
        New Note Inside
      </button>
    {/if}

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
      onclick={() => {
        const noteToRename = store.notes.find(
          (n) => n.id === contextMenu!.noteId,
        );
        if (noteToRename) {
          startRename(noteToRename.id, noteToRename.title);
        }
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
      </svg>
      Rename
    </button>

    <button
      class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
      onclick={() => handleDelete(contextMenu!.noteId)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 6h18"></path>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
      </svg>
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
        onkeydown={(e) => {
          if (e.key === "Enter") {
            handleRename();
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
