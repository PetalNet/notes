<script lang="ts">
  import {
    draggable,
    dropTargetForElements,
  } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
  import {
    attachClosestEdge,
    extractClosestEdge,
    type Edge,
  } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { type TreeNode, findNode } from "$lib/utils/tree.ts";
  import type { NoteOrFolder } from "$lib/schema.ts";
  import {
    updateNote,
    reorderNotes,
    getNotes,
  } from "$lib/remote/notes.remote.ts";
  import Self from "./TreeItem.svelte";
  import { ChevronRight, Folder, FileText } from "@lucide/svelte";
  import { clsx } from "clsx";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  interface Props {
    item: TreeNode;
    expandedFolders: Set<string>;
    toggleFolder: (id: string) => void;
    handleContextMenu: (e: MouseEvent, id: string, isFolder: boolean) => void;
    index: number;
    parentId?: string | null;
    onReorder: (
      sourceId: string,
      targetIndex: number,
      parentId: string | null,
    ) => Promise<void>;
    notesList: NoteOrFolder[];
    notesTree: TreeNode[];
  }

  let {
    item,
    expandedFolders,
    toggleFolder,
    handleContextMenu,
    index = 0,
    parentId = null,
    onReorder,
    notesList,
    notesTree,
  }: Props = $props();

  let element: HTMLElement;
  let isDragging = $state(false);
  let closestEdge = $state<Edge | null>(null);
  let isDropTarget = $state(false); // For "drop into" folder

  onMount(() => {
    // Make draggable
    const dragCleanup = draggable({
      element,
      getInitialData: () => ({
        id: item.id,
        type: item.isFolder ? "folder" : "note",
        parentId,
        index,
      }),
      onDragStart: () => {
        isDragging = true;
      },
      onDrop: () => {
        isDragging = false;
      },
    });

    // Make drop target
    const dropCleanup = dropTargetForElements({
      element,
      getData: ({ input, element }) => {
        const data = { id: item.id, parentId, index, isFolder: item.isFolder };

        return attachClosestEdge(data, {
          element,
          input,
          allowedEdges: ["top", "bottom"],
        });
      },
      onDragEnter: ({ self }) => {
        closestEdge = extractClosestEdge(self.data);
      },
      onDrag: ({ self, location }) => {
        closestEdge = extractClosestEdge(self.data);

        // Check for "drop into" zone for folders
        if (item.isFolder) {
          const rect = element.getBoundingClientRect();
          const y = location.current.input.clientY;
          const relativeY = y - rect.top;
          const height = rect.height;

          // If in the middle 50%, treat as "drop into"
          if (relativeY > height * 0.25 && relativeY < height * 0.75) {
            isDropTarget = true;
            closestEdge = null; // Clear edge to indicate drop into
          } else {
            isDropTarget = false;
          }
        }
      },
      onDragLeave: () => {
        closestEdge = null;
        isDropTarget = false;
      },
      onDrop: async ({ source }) => {
        const sourceId = source.data["id"] as string;
        const sourceParentId = source.data["parentId"] as string | null;

        // 1. Drop INTO folder
        if (isDropTarget && item.isFolder) {
          isDropTarget = false;
          closestEdge = null;
          if (sourceId !== item.id && sourceParentId !== item.id) {
            await updateNote({ noteId: sourceId, parentId: item.id });
            await getNotes().refresh();
            // Expand folder to show dropped item
            if (!expandedFolders.has(item.id)) {
              toggleFolder(item.id);
            }
          }
          return;
        }

        // 2. Reorder (Insert Before/After)
        if (closestEdge == null) return;
        const edge = closestEdge;
        closestEdge = null;
        isDropTarget = false;

        // Don't reorder if dropping on itself
        if (sourceId === item.id) return;

        // Calculate target index
        let targetIndex = index;
        if (edge === "bottom") {
          targetIndex += 1;
        }

        // Adjust targetIndex if source is before target in the same list
        // This is necessary because removing an item shifts subsequent items' indices.
        // If we're moving an item from an earlier position to a later position,
        // the target index needs to be decremented by 1 to account for the removal.
        if (sourceParentId === parentId) {
          const currentList =
            parentId === null
              ? notesTree
              : (() => {
                  let note = findNode(notesTree, parentId);
                  return note?.isFolder ? note.children : [];
                })();
          const sourceIndex = currentList.findIndex((n) => n.id === sourceId);
          if (sourceIndex !== -1 && sourceIndex < targetIndex) {
            targetIndex -= 1;
          }
        }

        await onReorder(sourceId, targetIndex, parentId);
      },
    });

    return () => {
      dragCleanup();
      dropCleanup();
    };
  });
</script>

<div bind:this={element} class={["relative", isDragging && "opacity-50"]}>
  <!-- Drop Indicators -->
  {#if closestEdge === "top"}
    <div
      class="pointer-events-none absolute top-0 right-0 left-0 z-10 h-0.5 rounded-full bg-indigo-500"
    ></div>
  {/if}
  {#if closestEdge === "bottom"}
    <div
      class="pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-0.5 rounded-full bg-indigo-500"
    ></div>
  {/if}

  <!-- Drop Into Highlight -->
  <div
    class={[
      "pointer-events-none absolute inset-0 rounded-md bg-indigo-100/50 transition-opacity duration-200",
      isDropTarget ? "opacity-100" : "opacity-0",
    ]}
  ></div>

  {#if item.isFolder}
    <!-- Folder Item -->
    <div class="group relative">
      <button
        tabindex="0"
        class="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-base-content transition-all select-none hover:bg-primary-content hover:text-primary hover:shadow-sm"
        onclick={() => toggleFolder(item.id)}
        oncontextmenu={(e) => handleContextMenu(e, item.id, true)}
        onkeydown={(e) => e.key === "Enter" && toggleFolder(item.id)}
      >
        <ChevronRight
          class={clsx(
            // lucid-svelte doesn’t automatically wrap classes with clsx.
            [
              "transition-transform duration-200",
              expandedFolders.has(item.id) && "rotate-90",
            ],
          )}
        />
        <Folder class="text-indigo-400" />
        <span class="flex-1 truncate text-start">{item.title}</span>
      </button>

      <!-- Nested Items -->
      {#if expandedFolders.has(item.id)}
        <div
          class="mt-0.5 ml-4 min-h-2.5 space-y-0.5 border-l border-slate-200 pl-2"
          transition:slide|local={{ duration: 200 }}
        >
          {#each item.children as child, idx (child.id)}
            <Self
              item={child}
              {expandedFolders}
              {toggleFolder}
              {handleContextMenu}
              index={idx}
              parentId={item.id}
              {notesList}
              {notesTree}
              onReorder={async (sourceId, targetIndex) => {
                const children = item.children;
                const itemToMove = notesList.find((n) => n.id === sourceId);

                if (!itemToMove) return;

                const updates = children
                  .filter((c) => c.id !== sourceId)
                  .toSpliced(targetIndex, 0, { ...itemToMove, children: [] })
                  .map((c, i) => ({ id: c.id, order: i }));
                await reorderNotes(updates);
                await getNotes().refresh();
              }}
            />
          {/each}
          {#if item.children.length === 0}
            <div class="px-2 py-1.5 text-xs text-slate-400 italic">
              Empty folder
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Note Item -->
    <button
      onclick={() => {
        goto(resolve("/notes/[id]", { id: item.id }));
      }}
      class={[
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-all hover:bg-primary-content hover:text-primary hover:shadow-sm",
        page.params.id === item.id
          ? "bg-primary-content text-primary shadow-sm"
          : "text-base-content",
      ]}
      oncontextmenu={(e) => {
        handleContextMenu(e, item.id, false);
      }}
    >
      <FileText />
      <span class="truncate">{item.title || "Untitled"}</span>
    </button>
  {/if}
</div>
