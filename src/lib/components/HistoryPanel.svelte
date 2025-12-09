<script lang="ts">
  import { Clock, RotateCcw, User } from "@lucide/svelte";
  import type { HistoryEntry, LoroNoteManager } from "$lib/loro.ts";
  import { formatRelativeTime } from "$lib/utils/time.ts";

  interface Props {
    manager: LoroNoteManager | undefined;
    isOpen: boolean;
    onClose: () => void;
  }

  let { manager, isOpen, onClose }: Props = $props();

  let history = $state<HistoryEntry[]>([]);
  let selectedVersion = $state<number | null>(null);
  let unsubscribe: (() => void) | null = null;

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
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  });

  function restoreVersion(version: number) {
    // TODO: Implement version restoration using Loro's checkout functionality
    console.log("Restoring version:", version);
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-base-content/10 bg-base-100 shadow-xl"
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
        onclick={onClose}
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
              ].join(" ")}
            >
              <!-- Version Header -->
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  {#if entry.peerId}
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-content"
                    >
                      {entry.peerId.slice(0, 2).toUpperCase()}
                    </div>
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
          onclick={() => restoreVersion(cachedVersion)}
          class="btn w-full btn-primary"
        >
          <RotateCcw class="h-4 w-4" />
          Restore This Version
        </button>
      </div>
    {/if}
  </div>

  <!-- Backdrop -->
  <button
    onclick={onClose}
    class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
    aria-label="Close history panel"
  ></button>
{/if}
