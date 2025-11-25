<script lang="ts">
  import { dev } from "$app/environment";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import type { LoroNoteManager } from "$lib/loro.js";
  import { notes } from "$lib/store.svelte.js";
  import { FilePlus, Folder } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  // TODO: SSR
  await notes.load();

  let selectedNote = $derived(
    notes.notesList.find((n) => n.id === notes.selectedNoteId),
  );
  let loroManager = $state<LoroNoteManager>();
  let editorContent = $state("");
  let unsubscribeContent: (() => void) | undefined;

  // Load Loro manager when note is selected
  $effect.pre(() => {
    const selectedId = notes.selectedNoteId;
    console.log("[Page] Effect triggered. SelectedNoteId:", selectedId);

    // Cleanup previous subscription
    if (unsubscribeContent) {
      console.log("[Page] Cleaning up previous subscription");
      unsubscribeContent();
      unsubscribeContent = undefined;
    }

    if (selectedId && selectedNote && !selectedNote.isFolder) {
      void notes.syncSelectedNote(selectedId);
      console.log("[Page] Loading Loro manager for note:", selectedId);
      void notes.getLoroManager(selectedId).then((manager) => {
        console.log(
          "[Page] Loro manager loaded:",
          manager ? "Success" : "Failed",
        );
        loroManager = manager;
        if (manager) {
          // Set initial content
          const initialContent = manager.getContent();
          console.log("[Page] Initial content:", initialContent);
          editorContent = initialContent;

          // Subscribe to content changes
          unsubscribeContent = manager.subscribeToContent((content) => {
            console.log(
              "[Page] Content update received. Preview:",
              content.slice(0, 20),
            );
            editorContent = content;
          });
        }
      });
    } else {
      console.log("[Page] No valid note selected or is folder");
      loroManager = undefined;
      editorContent = "";
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    if (unsubscribeContent) {
      unsubscribeContent();
    }
  });
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if selectedNote && loroManager}
    <Editor
      content={editorContent}
      onchange={(newContent: string) => {
        // Update local state immediately to avoid jitter
        editorContent = newContent;
        // Update Loro
        loroManager?.updateContent(newContent);
      }}
    />
  {:else if selectedNote?.isFolder}
    <div class="flex h-full items-center justify-center text-slate-400">
      <div class="text-center">
        <p class="mb-2 text-xl font-medium">
          <Folder class="inline-block" />
          {selectedNote.title}
        </p>
        <p class="text-sm">Select a note inside to start editing.</p>
      </div>
    </div>
  {:else}
    <div class="flex h-full items-center justify-center text-slate-400">
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100"
        >
          <FilePlus />
        </div>
        <p class="mb-2 text-xl font-medium">No note selected</p>
        <p class="text-sm">
          Select a note from the sidebar or create a new one.
        </p>
      </div>
    </div>
  {/if}
</div>

<!-- Debug Overlay -->
{#if dev}
  <div
    class="pointer-events-none absolute right-4 bottom-4 z-50 max-w-sm rounded bg-black/80 p-4 font-mono text-xs text-white"
  >
    <p>Selected Note: {notes.selectedNoteId}</p>
    <p>Loro Manager: {loroManager ? "Loaded" : "Null"}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
  </div>
{/if}
