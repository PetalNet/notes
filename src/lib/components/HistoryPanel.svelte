<script lang="ts">
  import { Clock, RotateCcw, User } from "@lucide/svelte";
  import type { HistoryEntry, LoroNoteManager } from "$lib/loro.ts";
  import { formatRelativeTime } from "$lib/utils/time.ts";
  import ProfilePicture from "./ProfilePicture.svelte";

  interface Props {
    manager: LoroNoteManager | undefined;
    isOpen: boolean;
  }

  let { manager, isOpen = $bindable() }: Props = $props();

  let history = $state<HistoryEntry[]>([]);
  let selectedVersion = $state<number | null>(null);
  let unsubscribe: (() => void) | undefined;
  let drawerDialog: HTMLDialogElement;
  let restoreDialog: HTMLDialogElement;
  let versionToRestore = $state<number | null>(null);
  let isClosing = $state(false);

  // Load history from Loro document
  function loadHistory() {
    if (!manager) {
      history = [];
      return;
    }

    history = manager.getHistory();
  }

  // Subscribe to live updates
  $effect(() => {
    if (manager && isOpen) {
      loadHistory();

      // Subscribe to document changes for live updates
      unsubscribe = manager.subscribeToHistory(() => {
        loadHistory();
      });
    }

    return () => {
      unsubscribe?.();
      unsubscribe = undefined;
    };
  });

  // Sync isOpen with dialog
  $effect(() => {
    if (isOpen) {
      isClosing = false;
      if (!drawerDialog.open) drawerDialog.showModal();
    } else {
      if (drawerDialog.open) {
        isClosing = true;
        setTimeout(() => {
          drawerDialog.close();
          isClosing = false;
        }, 300);
      }
    }
  });

  function promptRestore(version: number) {
    versionToRestore = version;
    restoreDialog.showModal();
  }

  function confirmRestore() {
    if (versionToRestore !== null) {
      // TODO: Implement version restoration using Loro's checkout functionality
      console.log("Restoring version:", versionToRestore);
      versionToRestore = null;
    }
  }
</script>

<dialog
  bind:this={drawerDialog}
  class="group modal justify-items-end"
  oncancel={() => {
    isOpen = false;
  }}
>
  <div
    class={[
      "modal-box m-0 flex h-full max-h-screen w-80 translate-x-full scale-100 flex-col flex-nowrap rounded-none bg-base-100 p-0 text-base-content transition-[translate,transform] duration-300 group-open:translate-x-0",
      isClosing && "translate-x-full!",
    ]}
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-base-content/10 p-4"
    >
      <div class="flex items-center gap-2">
        <Clock class="h-5 w-5 text-primary" />
        <h2 class="text-lg font-semibold">Version History</h2>
      </div>
      <button
        onclick={() => {
          isOpen = false;
        }}
        class="btn btn-circle btn-ghost btn-sm"
        aria-label="Close history"
      >
        ✕
      </button>
    </div>

    <!-- History List -->
    <div class="flex-1 overflow-y-auto p-4">
      {#if history.length === 0}
        <div class="flex h-full items-center justify-center text-center">
          <div>
            <Clock class="mx-auto mb-2 h-12 w-12 text-base-content/30" />
            <p class="text-sm text-base-content/60">No history available</p>
          </div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each history as entry, i (entry.version)}
            <button
              onclick={() => (selectedVersion = entry.version)}
              class={[
                "w-full rounded-lg border p-3 text-left transition-all",
                selectedVersion === entry.version
                  ? "border-primary bg-primary/10"
                  : "border-base-content/10 hover:border-primary/50 hover:bg-base-200",
              ]}
            >
              <!-- Version Header -->
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  {#if entry.peerId}
                    <ProfilePicture name={entry.peerId.slice(0, 2)} />
                    <span class="font-mono text-sm font-medium"
                      >{entry.peerId.slice(0, 8)}</span
                    >
                  {:else}
                    <User class="h-4 w-4 text-base-content/50" />
                    <span class="text-sm text-base-content/60">Unknown</span>
                  {/if}
                </div>
                <span class="text-xs text-base-content/50">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>

              <!-- Preview -->
              <p class="line-clamp-2 text-xs text-base-content/70">
                {entry.preview || "Empty document"}
              </p>

              <!-- Version Number -->
              <div class="mt-2 flex items-center justify-between">
                <span class="font-mono text-xs text-base-content/50">
                  v{entry.version}
                </span>
                {#if i === 0}
                  <span
                    class="rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success"
                  >
                    Current
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Actions -->
    {#if selectedVersion !== null && selectedVersion !== history[0]?.version}
      {@const cachedVersion = selectedVersion}
      <div class="border-t border-base-content/10 p-4">
        <button
          onclick={() => promptRestore(cachedVersion)}
          class="btn w-full btn-primary"
        >
          <RotateCcw class="h-4 w-4" />
          Restore This Version
        </button>
      </div>
    {/if}
  </div>
  <div class="modal-backdrop">
    <button type="button" onclick={() => (isOpen = false)}>close</button>
  </div>
</dialog>

<dialog bind:this={restoreDialog} class="modal">
  <div class="modal-box">
    <h3 class="text-lg font-bold">Restore Version</h3>
    <p class="py-4">
      Are you sure you want to restore version <span class="font-mono font-bold"
        >v{versionToRestore}</span
      >? This will create a new version with the contents of the selected
      version.
    </p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">Cancel</button>
        <button class="btn btn-primary" onclick={confirmRestore}>Restore</button
        >
      </form>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
