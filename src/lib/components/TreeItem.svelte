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
  import { notes, type TreeNode } from "$lib/store.svelte.ts";
  import Self from "./TreeItem.svelte";
  import { ChevronRight, Folder, FileText } from "lucide-svelte";
  import { clsx } from "clsx";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";

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
  }

  let {
    item,
    expandedFolders,
    toggleFolder,
    handleContextMenu,
    index = 0,
    parentId = null,
    onReorder,
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
        const sourceId = source.data.id as string;
        const sourceParentId = source.data.parentId as string | null;

        // 1. Drop INTO folder
        if (isDropTarget && item.isFolder) {
          isDropTarget = false;
          closestEdge = null;
          if (sourceId !== item.id && sourceParentId !== item.id) {
            await notes.moveNoteToFolder(sourceId, item.id);
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
              ? notes.notesList
              : (() => {
                  let note = notes.notesTree.find((f) => f.id === parentId);
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

<div
  bind:this={element}
  class={{
    relative: true,
    "opacity-50": isDragging,
  }}
>
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
    class={{
      "pointer-events-none": true,
      absolute: true,
      "inset-0": true,
      "rounded-md": true,
      "bg-indigo-100/50": true,
      "transition-opacity duration-200": true,
      "opacity-100": isDropTarget,
      "opacity-0": !isDropTarget,
    }}
  ></div>

  {#if item.isFolder}
    <!-- Folder Item -->
    <div class="group relative">
      <button
        tabindex="0"
        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors select-none hover:bg-slate-100"
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
        <span class="flex-1 truncate">{item.title}</span>
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
              onReorder={async (sourceId, targetIndex) => {
                const children = item.children;
                const sourceIndex = children.findIndex(
                  (c) => c.id === sourceId,
                );
                let adjustedTargetIndex = targetIndex;

                if (sourceIndex !== -1 && sourceIndex < targetIndex) {
                  adjustedTargetIndex -= 1;
                }

                const updates = children
                  .filter((c) => c.id !== sourceId)
                  .toSpliced(
                    adjustedTargetIndex,
                    0,
                    children.find((c) => c.id === sourceId)!,
                  )
                  .map((c, i) => ({ id: c.id, order: i }));
                await notes.reorderNotes(updates);
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
      onclick={() => goto(resolve("/notes/[id]", { id: item.id }))}
      class={{
        flex: true,
        "w-full": true,
        "items-center": true,
        "gap-2": true,
        "rounded-md": true,
        "px-2": true,
        "py-1.5": true,
        "text-left": true,
        "text-sm": true,
        "text-slate-600": true,
        "transition-all": true,
        "hover:bg-white": true,
        "hover:text-indigo-600": true,
        "hover:shadow-sm": true,
        "bg-white": page.route.id === item.id,
        "shadow-sm": page.route.id === item.id,
        "text-indigo-600": page.route.id === item.id,
      }}
      oncontextmenu={(e) => handleContextMenu(e, item.id, false)}
    >
      <FileText />
      <span class="truncate">{item.title || "Untitled"}</span>
    </button>
  {/if}
</div>
