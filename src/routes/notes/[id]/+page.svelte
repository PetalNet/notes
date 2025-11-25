<script lang="ts">
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import { LoroNoteManager } from "$lib/loro.js";
  import { getNotes, updateNote } from "$lib/remote/notes.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import { FilePlus, Folder } from "@lucide/svelte";
  import { onDestroy, untrack } from "svelte";
  import { getUserPrivateKey } from "$lib/context";
  import { decryptKey } from "$lib/crypto";

  let selectedId = $derived(page.params.id);
  let loroManager = $state<LoroNoteManager>();
  let editorContent = $state("");

  let unsubscribeContent: (() => void) | undefined;

  const userPrivateKey = getUserPrivateKey();

  // Load Loro manager when note is selected
  $effect(() => {
    const id = selectedId;
    console.log("[Page] Effect triggered. SelectedNoteId:", id);

    untrack(() => {
      // Cleanup previous subscription
      if (unsubscribeContent) {
        console.log("[Page] Cleaning up previous subscription");
        unsubscribeContent();
        unsubscribeContent = undefined;
      }

      if (loroManager) {
        loroManager.destroy();
        loroManager = undefined;
      }
    });

    if (id) {
      unawaited(
        (async () => {
          const notesList = await getNotes();
          const selectedNote = notesList.find((n) => n.id === id);

          if (selectedNote && !selectedNote.isFolder) {
            console.log("[Page] Loading Loro manager for note:", id);

            if (!userPrivateKey) {
              console.error("No private key available");
              return;
            }

            try {
              const noteKey = await decryptKey(
                selectedNote.encryptedKey,
                userPrivateKey,
              );

              const manager = new LoroNoteManager(
                id,
                noteKey,
                async (snapshot) => {
                  await updateNote({ noteId: id, loroSnapshot: snapshot });
                },
              );

              if (selectedNote.loroSnapshot) {
                await manager.init(selectedNote.loroSnapshot);
              }

              manager.startSync();
              loroManager = manager;

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
            } catch (error) {
              console.error("Failed to load note:", error);
            }
          } else {
            console.log("[Page] No valid note selected or is folder");
            editorContent = "";
          }
        })(),
      );
    } else {
      editorContent = "";
    }

    return () => loroManager?.destroy();
  });

  // Cleanup on destroy
  onDestroy(() => {
    if (unsubscribeContent) {
      unsubscribeContent();
    }
  });

  const notesList = $derived(await getNotes());
  const selectedNote = $derived(notesList.find((n) => n.id === selectedId));
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if selectedNote && loroManager}
    <Editor
      content={editorContent}
      {notesList}
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
    <p>Selected Note: {selectedId}</p>
    <p>Loro Manager: {loroManager ? "Loaded" : "Null"}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
  </div>
{/if}
