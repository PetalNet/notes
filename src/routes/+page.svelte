<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { store } from "$lib/store.svelte.ts";
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
</script>

<div class="flex h-screen overflow-hidden bg-white">
  {#if data.user}
    <Sidebar user={data.user} />
  {/if}
  <div class="relative h-full flex-1 overflow-hidden">
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
  </div>
</div>
