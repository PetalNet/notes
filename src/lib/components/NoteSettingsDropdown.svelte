<script lang="ts">
  import {
    MoreVertical,
    Users,
    Settings,
    LogOut,
    Trash2,
  } from "@lucide/svelte";

  interface Props {
    noteId: string;
    isOwner: boolean;
    onViewMembers: () => void;
    onManagePermissions: () => void;
    onLeave: () => void;
    onDelete: () => void;
  }

  let {
    noteId,
    isOwner,
    onViewMembers,
    onManagePermissions,
    onLeave,
    onDelete,
  }: Props = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLElement>();

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    isOpen = !isOpen;
  }

  function handleAction(action: () => void) {
    isOpen = false;
    action();
  }

  // Close on click outside
  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      isOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" bind:this={dropdownRef}>
  <button
    onclick={toggle}
    class="btn p-0.5 opacity-0 btn-ghost transition-opacity btn-xs group-hover/note:opacity-100"
    title="Note settings"
  >
    <MoreVertical class="h-4 w-4" />
  </button>

  {#if isOpen}
    <div
      class="absolute top-full right-0 z-50 mt-1 w-44 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
    >
      <button
        onclick={() => handleAction(onViewMembers)}
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
      >
        <Users class="h-4 w-4" />
        View Members
      </button>

      {#if isOwner}
        <button
          onclick={() => handleAction(onManagePermissions)}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
        >
          <Settings class="h-4 w-4" />
          Manage Permissions
        </button>

        <div class="my-1 border-t border-base-300"></div>

        <button
          onclick={() => handleAction(onDelete)}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error hover:bg-error/10"
        >
          <Trash2 class="h-4 w-4" />
          Delete Note
        </button>
      {:else}
        <div class="my-1 border-t border-base-300"></div>

        <button
          onclick={() => handleAction(onLeave)}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning hover:bg-warning/10"
        >
          <LogOut class="h-4 w-4" />
          Leave Note
        </button>
      {/if}
    </div>
  {/if}
</div>
