<script lang="ts" module>
  const loroManagers = new SvelteMap<string, LoroNoteManager>();
</script>

<script lang="ts">
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import { LoroNoteManager } from "$lib/loro.ts";
  import { getNotes, updateNote } from "$lib/remote/notes.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import { decryptKey } from "$lib/crypto";
  import { FilePlus, Folder } from "@lucide/svelte";
  import { SvelteMap } from "svelte/reactivity";

  const { data } = $props();

  const notesListQuery = $derived(getNotes());
  let id = $derived(page.params.id);
  const userPrivateKey = data.user?.privateKeyEncrypted;

  let loroManager = $derived(
    id !== undefined ? loroManagers.get(id) : undefined,
  );
  // TODO: Use codemirror-server-render to SSR the editor
  let editorContent = $state("");

  const notesList = $derived(await notesListQuery);
  const note = $derived(notesList.find((n) => n.id === id));

  // Load Loro manager when note is selected
  $effect.pre(() => {
    console.debug("[Page] Effect triggered. SelectedNoteId:", id);

    let unsubscribeContent: (() => void) | undefined;
    const abortController = new AbortController();
    const signal = abortController.signal;

    unawaited(
      (async (signal) => {
        if (id && note && !note.isFolder) {
          let key: string | undefined;
          if (userPrivateKey) {
            try {
              key = await decryptKey(note.encryptedKey, userPrivateKey);
            } catch (e) {
              console.error("Failed to decrypt key:", e);
            }
          }

          if (signal.aborted) return;

          if (key) {
            console.debug("[Page] Loading Loro manager for note:", id);

            const manager = await LoroNoteManager.create(
              id,
              key,
              async (snapshot) => {
                await updateNote({ noteId: id, loroSnapshot: snapshot });
              },
              note.loroSnapshot,
            );

            if (signal.aborted as boolean) {
              manager.stopSync();
              return;
            }

            manager.startSync();
            loroManagers.set(id, manager);

            return;
          }
        } else if (!note || note.isFolder) {
          console.debug("[Page] No valid note selected or is folder");
        }
        editorContent = "";
      })(signal),
    );

    return () => {
      console.debug("[Page] Cleaning up previous subscription");
      abortController.abort();
      loroManager?.stopSync();
      unsubscribeContent?.();
    };
  });
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if !(note?.isFolder ?? true)}
    <Editor manager={loroManager} {notesList} user={data.user} />
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
    <p>Loro Manager: {loroManager ? "Loaded" : "Null"}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
    <p>~Word Count: {editorContent.split(/\s+/).length}</p>
  </div>
{/if}
