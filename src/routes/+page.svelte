<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import { store } from "$lib/store.svelte.ts";

  let { data } = $props();

  onMount(async () => {
    if (data.user) {
      store.setCurrentUser(data.user);

      // TODO: Decrypt private key with password
      // For now, using the encrypted key as-is (needs proper PBKDF2 implementation)
      if (data.user.privateKeyEncrypted) {
        // In production, this should decrypt with user's password
        store.setUserPrivateKey(atob(data.user.privateKeyEncrypted));
      }

      await store.loadNotes();
    }
  });

  let selectedNote = $derived(
    store.notes?.find((n) => n.id === store.selectedNoteId),
  );
  let loroManager = $state<any>(null);
  let editorContent = $state("");
  let unsubscribeContent: (() => void) | null = null;

  // Load Loro manager when note is selected
  $effect(() => {
    console.log(
      "[Page] Effect triggered. SelectedNoteId:",
      store.selectedNoteId,
    );

    // Cleanup previous subscription
    if (unsubscribeContent) {
      console.log("[Page] Cleaning up previous subscription");
      unsubscribeContent();
      unsubscribeContent = null;
    }

    if (store.selectedNoteId && selectedNote && !selectedNote.isFolder) {
      console.log(
        "[Page] Loading Loro manager for note:",
        store.selectedNoteId,
      );
      store.getLoroManager(store.selectedNoteId).then((manager) => {
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
              "[Page] Content update received:",
              content.slice(0, 20),
            );
            editorContent = content;
          });
        }
      });
    } else {
      console.log("[Page] No valid note selected or is folder");
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

  async function handleNewNote() {
    try {
      await store.createNote("Untitled Note");
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  }
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
          loroManager.updateContent(newContent);
        }}
      />
    {:else if selectedNote && selectedNote.isFolder}
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path><path d="M14 2v6h6"></path><path d="M12 18v-6"
              ></path><path d="M9 15h6"></path></svg
            >
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
