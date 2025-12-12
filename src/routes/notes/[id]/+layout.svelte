<script lang="ts">
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";

  let { children, data } = $props();

  const notesList = $derived(await getNotes());
</script>

<div class="flex h-screen overflow-hidden">
  {#if data.user}
    <Sidebar user={data.user} {notesList} />
  {/if}

  {@render children()}
</div>
