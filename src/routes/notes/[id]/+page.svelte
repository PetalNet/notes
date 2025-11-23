<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/state";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import { store } from "$lib/store.svelte.ts";
  import type { LoroNoteManager } from "$lib/loro.js";
  import { FilePlus } from "lucide-svelte";

  let { data } = $props();

  onMount(async () => {
    if (data.user) {
      store.setCurrentUser(data.user);

      // TODO: Decrypt private key with password
      // For now, using the encrypted key as-is (needs proper PBKDF2 implementation)
      if (data.user.privateKeyEncrypted) {
        // In production, this should decrypt with user's password
        store.setUserPrivateKey(data.user.privateKeyEncrypted);
      }

      await store.loadNotes();
    }
  });

  // Sync URL param with store
  $effect(() => {
    if (page.params.id) {
      store.selectNote(page.params.id);
    }
  });

  let selectedNote = $derived(
    store.notes?.find((n) => n.id === store.selectedNoteId),
  );
  let loroManager = $state<LoroNoteManager | null>(null);
  let editorContent = $state("");
  let unsubscribeContent: (() => void) | null = null;

  $inspect(selectedNote).with((val) =>
    console.log("Inspect selectedNote:", val),
  );
  $inspect(loroManager).with((val) => console.log("Inspect loroManager:", val));
  $inspect(store.selectedNoteId).with((val) =>
    console.log("Inspect store.selectedNoteId:", val),
  );

  // Load Loro manager when note is selected
  $effect(() => {
    // Cleanup previous subscription
    if (unsubscribeContent) {
      unsubscribeContent();
      unsubscribeContent = null;
    }

    if (store.selectedNoteId && selectedNote && !selectedNote.isFolder) {
      console.log("Page: Loading Loro manager for:", store.selectedNoteId);
      store.getLoroManager(store.selectedNoteId).then((manager) => {
        console.log(
          "Page: Loro manager loaded result:",
          manager ? "Success" : "Failed",
        );
        loroManager = manager;
        if (manager) {
          // Set initial content
          const initialContent = manager.getContent();
          console.log("Page: Initial content length:", initialContent.length);
          editorContent = initialContent;

          // Subscribe to content changes
          unsubscribeContent = manager.subscribeToContent((content) => {
            console.log("Page: Content update received");
            editorContent = content;
          });
        }
      });
    } else {
      console.log("No valid note selected:", {
        id: store.selectedNoteId,
        note: selectedNote,
        isFolder: selectedNote?.isFolder,
      });
      loroManager = null;
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

<div class="flex h-screen overflow-hidden bg-white">
  {#if data.user}
    <Sidebar user={data.user} />
  {/if}
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
    {:else if selectedNote && !loroManager}
      <div
        class="flex h-full items-center justify-center bg-white text-slate-400"
      >
        <div class="flex flex-col items-center gap-2">
          <div
            class="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500"
          ></div>
          <p>Loading editor...</p>
        </div>
      </div>
    {:else if selectedNote?.isFolder}
      <div
        class="flex h-full items-center justify-center bg-slate-50 text-slate-400"
      >
        <div class="text-center">
          <p class="mb-2 text-xl font-medium">📁 {selectedNote.title}</p>
          <p class="text-sm">Select a note inside to start editing</p>
        </div>
      </div>
    {:else}
      <div
        class="flex h-full items-center justify-center bg-slate-50 text-slate-400"
      >
        <div class="text-center">
          <div
            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100"
          >
            <FilePlus />
          </div>
          <p class="mb-2 text-xl font-medium">No note selected</p>
          <p class="text-sm">
            Select a note from the sidebar or create a new one
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Debug Overlay -->
  <div
    class="pointer-events-none absolute right-4 bottom-4 z-50 max-w-sm rounded bg-black/80 p-4 font-mono text-xs text-white"
  >
    <p>Selected Note: {store.selectedNoteId}</p>
    <p>Loro Manager: {loroManager ? "Loaded" : "Null"}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
  </div>
</div>
