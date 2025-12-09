<script lang="ts" module>
  const loroManagers = new SvelteMap<string, LoroNoteManager>();
</script>

<script lang="ts">
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import { LoroNoteManager } from "$lib/loro.ts";
  import { getNotes, updateNote } from "$lib/remote/notes.remote.ts";
  import { joinFederatedNote } from "$lib/remote/federation.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import { decryptKey } from "$lib/crypto";
  import { FilePlus, Folder } from "@lucide/svelte";
  import { SvelteMap } from "svelte/reactivity";

  const { data } = $props();

  const notesListQuery = $derived(data.user ? getNotes() : Promise.resolve([]));
  let id = $derived(page.params.id);
  const userPrivateKey = data.user?.privateKeyEncrypted;

  let loroManager = $derived(
    id !== undefined ? loroManagers.get(id) : undefined,
  );
  // TODO: Use codemirror-server-render to SSR the editor
  let editorContent = $state("");

  const notesList = $derived(await notesListQuery);
  const note = $derived(notesList.find((n) => n.id === id));

  // Track which notes we've attempted to join to prevent infinite loops
  let attemptedJoins = $state<Set<string>>(new Set());

  // Auto-join foreign notes when authenticated
  $effect(() => {
    if (
      data.user &&
      !data.isLocal &&
      id &&
      !note &&
      data.originServer &&
      !attemptedJoins.has(id)
    ) {
      // This is a foreign note we haven't joined yet
      console.log(`Auto-joining foreign note from ${data.originServer}`);
      attemptedJoins.add(id);

      unawaited(
        joinFederatedNote({ noteId: id, originServer: data.originServer })
          .then(async () => {
            console.log("Successfully joined federated note");
            // Trigger notes list refresh by navigating to trigger load
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.location.href = `/notes/${id}`;
          })
          .catch((err) => {
            console.error("Federation join failed:", err);
            // Remove from attempted joins on failure so user can retry
            attemptedJoins.delete(id);
          }),
      );
    }
  });

  function handleOpenInHomeserver(inputHandle: string | null) {
    const saved = localStorage.getItem("notes_homeserver_handle") || "";
    const input =
      inputHandle ??
      prompt(
        "Enter your full handle to open this there (e.g. @alice:example.com)",
        saved,
      );
    if (input) {
      let domain = "";

      // Remove @ prefix if present
      const cleaned = input.startsWith("@") ? input.slice(1) : input;

      // Split by first colon to get user and domain parts
      const firstColonIndex = cleaned.indexOf(":");
      if (firstColonIndex !== -1) {
        // Everything after first colon is the domain (handles domain:port)
        domain = cleaned.slice(firstColonIndex + 1);
      } else {
        // Fallback: try splitting by @ for user@domain format
        const atIndex = cleaned.indexOf("@");
        if (atIndex !== -1) {
          domain = cleaned.slice(atIndex + 1);
        }
      }

      if (domain) {
        localStorage.setItem("notes_homeserver_handle", input);
        // Redirect to their homeserver with the same note ID
        window.location.href = `${window.location.protocol}//${domain.trim()}/notes/${id}`;
      } else {
        alert("Could not determine server domain from handle.");
      }
    }
  }
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if note}
    {#if !note.isFolder}
      <Editor
        noteId={id}
        noteTitle={note.title}
        manager={loroManager}
        {notesList}
        user={data.user}
        {handleOpenInHomeserver}
      />
    {:else}
      <div class="flex h-full items-center justify-center text-slate-400">
        <div class="text-center">
          <p class="mb-2 text-xl font-medium">
            <Folder class="inline-block" />
            {note.title}
          </p>
          <p class="text-sm">Select a note inside to start editing.</p>
        </div>
      </div>
    {/if}
  {:else}
    <!-- No note found or unauthenticated -->
    <div
      class="relative flex h-full items-center justify-center text-base-content"
    >
      {#if !data.user}
        <div class="max-w-md p-8 text-center">
          <h3 class="mb-4 text-xl font-bold">
            You do not have access to this note
          </h3>
          <p class="mb-6 text-base-content/70">
            This note is from <strong>{data.originServer}</strong>. It seems you
            are not logged in or this note is private. If you are a user on
            another server, enter your handle to open this note there.
          </p>

          <div class="join w-full">
            <input
              type="text"
              placeholder="@user:domain.com"
              class="input-bordered input join-item w-full"
              onkeydown={(e) =>
                e.key === "Enter" &&
                handleOpenInHomeserver(e.currentTarget.value)}
            />
            <button
              class="btn join-item btn-primary"
              onclick={(e) => {
                const input = e.currentTarget
                  .previousElementSibling as HTMLInputElement;
                handleOpenInHomeserver(input.value);
              }}
            >
              Open
            </button>
          </div>

          <p class="mt-4 text-xs text-base-content/50">
            Example: @alice:localhost.com
          </p>

          <div class="divider">OR</div>

          <a
            href="/login?redirectTo={encodeURIComponent(`/notes/${id}`)}"
            class="btn btn-block btn-ghost"
          >
            Log in on this server
          </a>
        </div>
      {:else}
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
      {/if}
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
