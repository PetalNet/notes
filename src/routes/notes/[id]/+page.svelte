<script lang="ts" module>
  import { LoroNoteManager } from "$lib/loro.svelte.ts";
  import { SvelteMap } from "svelte/reactivity";

  // Persist managers across navigations for background sync
  const loroManagers = new SvelteMap<string, LoroNoteManager>();
</script>

<script lang="ts">
  import { dev } from "$app/environment";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import { decryptKey } from "$lib/crypto.ts";
  import { getNotes, updateNote } from "$lib/remote/notes.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import { FilePlus, Folder } from "@lucide/svelte";

  const { data, params } = $props();

  const notesListQuery = $derived(getNotes());
  const id = $derived(params.id);
  const userPrivateKey = $derived(data.user?.privateKeyEncrypted);

  // Derive current manager from the map - reactive to map changes
  const currentManager = $derived(loroManagers.get(id));

  const notesList = $derived(await notesListQuery);
  const note = $derived(notesList.find((n) => n.id === id));

  // Derive editor content directly from manager's reactive state
  const editorContent = $derived(currentManager?.content ?? "");

  // Single effect: Create manager if needed (async side effect)
  $effect(() => {
    // Only create if: we have a note, it's not a folder, and no manager exists
    if (!note || note.isFolder || currentManager) return;

    // Capture values for async work
    const noteId = id;
    const noteTitle = note.title;
    const snapshot = note.loroSnapshot;
    const encryptedKey = note.encryptedKey;

    console.debug("[Page] Creating manager for:", noteId, noteTitle);

    const abortController = new AbortController();
    const signal = abortController.signal;

    unawaited(
      (async () => {
        let key: Uint8Array<ArrayBuffer> | undefined;
        if (userPrivateKey) {
          try {
            key = await decryptKey(encryptedKey, userPrivateKey);
          } catch (e) {
            console.error(
              "Failed to decrypt key for note",
              noteId,
              noteTitle,
              e,
            );
          }
        }

        if (signal.aborted || !key) return;

        try {
          const manager = await LoroNoteManager.create(
            noteId,
            key,
            async (snapshot) => {
              await updateNote({ noteId, loroSnapshot: snapshot });
            },
            snapshot,
          );

          if (signal.aborted as boolean) {
            manager.destroy();
            return;
          }

          manager.startSync();

          // Final check before caching
          if (signal.aborted as boolean) {
            manager.destroy();
            return;
          }

          loroManagers.set(noteId, manager);
        } catch (error) {
          console.error(
            "Failed to create manager for note",
            id,
            note.title,
            error,
          );
        }
      })(),
    );

    return () => {
      abortController.abort();
    };
  });
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if !(note?.isFolder ?? true)}
    <Editor
      content={editorContent}
      {notesList}
      onchange={(newContent: string) => {
        // Hook in Loro
        currentManager?.updateContent(newContent);
      }}
    />
  {:else if note?.isFolder}
    <div class="flex h-full items-center justify-center text-slate-400">
      <div class="text-center">
        <p class="mb-2 text-xl font-medium">
          <Folder class="inline-block" />
          {note.title}
        </p>
        <p class="text-sm">Select a note inside to start editing.</p>
      </div>
    </div>
  {:else}
    <div class="flex h-full items-center justify-center text-base-content">
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-content/25"
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
    <p>Selected Note: {id}</p>
    <p>Current Manager: {currentManager ? "Loaded" : "Null"}</p>
    <p>Cached Managers: {loroManagers.size}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
    <p>~Word Count: {editorContent.split(/\s+/).length}</p>
  </div>
{/if}
