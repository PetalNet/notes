<script lang="ts" module>
  const loroManagers = new SvelteMap<string, LoroNoteManager>();
  // Track joined notes in module scope to persist across component rerenders
  const joinedNotes = new Set<string>();
</script>

<script lang="ts">
  import type { NoteOrFolder } from "$lib/schema";
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import Editor from "$lib/components/codemirror/Editor.svelte";
  import { LoroNoteManager } from "$lib/loro.ts";
  import { getNotes, updateNote } from "$lib/remote/notes.remote.ts";
  import { joinFederatedNote } from "$lib/remote/federation.remote.ts";
  import { unawaited } from "$lib/unawaited.ts";
  import { decryptKey } from "$lib/crypto";
  import { FilePlus, Folder } from "@lucide/svelte";
  import { SvelteMap } from "svelte/reactivity";

  const { data } = $props();

  let notesList = $state<NoteOrFolder[]>([]);
  let isLoadingNotes = $state(true);
  let id = $derived(page.params.id);
  const userPrivateKey = data.user?.privateKeyEncrypted;

  let loroManager = $derived(
    id !== undefined ? loroManagers.get(id) : undefined,
  );
  // TODO: Use codemirror-server-render to SSR the editor
  let editorContent = $state("");

  $effect(() => {
    if (data.user) {
      isLoadingNotes = true;
      getNotes()
        .then((res) => {
          notesList = res;
        })
        .catch((e) => {
          console.error("Failed to load notes:", e);
        })
        .finally(() => {
          isLoadingNotes = false;
        });
    } else {
      notesList = [];
      isLoadingNotes = false;
    }
  });

  const note = $derived(notesList.find((n) => n.id === id));

  import ConfirmationModal from "$lib/components/ConfirmationModal.svelte";

  // ...

  // Track join state
  let isJoining = $state(false);
  let joinError = $state<string | null>(null);
  let redirectError = $state<string | null>(null);

  // Auto-join foreign notes when authenticated
  $effect(() => {
    if (
      data.user &&
      !data.isLocal &&
      id &&
      !note &&
      data.originServer &&
      !joinedNotes.has(id) &&
      !isJoining
    ) {
      // This is a foreign note we haven't joined yet
      console.log(`Auto-joining foreign note from ${data.originServer}`);
      joinedNotes.add(id);
      isJoining = true;
      joinError = null;

      unawaited(
        joinFederatedNote({ noteId: id, originServer: data.originServer })
          .then(async () => {
            console.log("Successfully joined federated note");
            isJoining = false;
            // Invalidate data to reload notes list without full page refresh
            await invalidateAll();
          })
          .catch((err) => {
            console.error("Federation join failed:", err);
            isJoining = false;
            joinError = err?.body?.message || "Failed to join note";
            // Remove from joined notes on failure so user can retry
            joinedNotes.delete(id);
          }),
      );
    }
  });

  // Initialize Loro manager for the current note
  $effect(() => {
    if (!id || !note || !userPrivateKey || !data.user) return;

    if (!loroManagers.has(id)) {
      console.log(`Initializing Loro manager for ${id}`);
      unawaited(
        (async () => {
          try {
            // Decrypt the note key if it's an envelope (long)
            // If it's short (raw key), use it directly.
            let noteKey = note.encryptedKey;
            if (note.encryptedKey.length > 60) {
              noteKey = await decryptKey(note.encryptedKey, userPrivateKey);
            }

            // Create manager
            const manager = await LoroNoteManager.create(
              id,
              noteKey,
              async (snapshot) => {
                // onUpdate: save snapshot (optional, mostly for backup since Ops are source of truth)
                // But we do update 'updatedAt' and maybe 'loroSnapshot' column?
                // The updateNote command handles updating the snapshot column.
                if (note.ownerId === data.user.id) {
                  await updateNote({ noteId: id, loroSnapshot: snapshot });
                } else {
                  // Federated/Shared notes: We don't save snapshots to 'notes' table (as we don't own it).
                  // In the future, we might save to 'members' table or local storage,
                  // but for now, rely on Replay from Ops.
                  // console.debug("[Loro] Skipping snapshot save for non-owned note");
                }
              },
              note.loroSnapshot,
            );

            // Start sync
            manager.startSync();

            loroManagers.set(id, manager);
          } catch (e) {
            console.error("Failed to init Loro manager:", e);
          }
        })(),
      );
    } else {
      // Ensure sync is running if we switch back to it
      const m = loroManagers.get(id);
      m?.startSync();
    }
  });

  import type { ConnectionState } from "$lib/loro";
  let connectionStatus = $state<ConnectionState>("disconnected");

  $effect(() => {
    if (loroManager) {
      const unsubscribe = loroManager.connectionState.subscribe((val) => {
        connectionStatus = val;
      });
      return unsubscribe;
    } else {
      connectionStatus = "disconnected";
      return;
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
        redirectError = "Could not determine server domain from handle.";
      }
    }
  }
</script>

<div class="relative h-full flex-1 overflow-hidden">
  {#if note}
    {#if !note?.isFolder}
      <Editor
        noteId={id}
        noteTitle={note.title}
        manager={loroManager}
        {notesList}
        user={data.user}
        {handleOpenInHomeserver}
      />

      <!-- Connection Status Banner -->
      {#if loroManager && connectionStatus !== "connected"}
        <div class="absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            class="alert px-4 py-2 text-sm font-medium shadow-lg
                 {connectionStatus === 'disconnected'
              ? 'alert-error'
              : 'alert-warning'}"
          >
            <span>
              {#if connectionStatus === "disconnected"}
                Disconnected.
                <button
                  class="btn ml-2 btn-outline btn-xs"
                  onclick={() => loroManager?.startSync()}>Reconnect</button
                >
              {:else if connectionStatus === "reconnecting"}
                Reconnecting...
              {:else}
                Connecting...
              {/if}
            </span>
          </div>
        </div>
      {/if}
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
      {#if isJoining}
        <div class="text-center">
          <span class="loading loading-lg loading-spinner text-primary"></span>
          <p class="mt-4 text-lg">Joining remote note...</p>
        </div>
      {:else if joinError}
        <div class="max-w-md p-8 text-center">
          <h3 class="mb-4 text-xl font-bold text-error">Failed to Join Note</h3>
          <p class="mb-6 text-base-content/70">{joinError}</p>
          <button
            class="btn btn-primary"
            onclick={() => window.location.reload()}>Retry</button
          >
        </div>
      {:else if !data.user}
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
    <p>Note Found: {!!note}</p>
    <p>Note Title: {note?.title}</p>
    <p>Loro Manager: {loroManager ? "Loaded" : "Null"}</p>
    <p>Content Length: {editorContent.length}</p>
    <p>Content Preview: {editorContent.slice(0, 50)}</p>
    <p>~Word Count: {editorContent.split(/\s+/).length}</p>
  </div>
{/if}

<ConfirmationModal
  isOpen={!!redirectError}
  title="Invalid Handle"
  message={redirectError || ""}
  type="warning"
  confirmText="OK"
  isAlert={true}
  onConfirm={() => (redirectError = null)}
  onCancel={() => (redirectError = null)}
/>
