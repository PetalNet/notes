<script>
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { notes } from "$lib/store.svelte.js";

  let { children, data } = $props();
</script>

<div class="flex h-screen overflow-hidden">
  {#if data.user}
    <Sidebar user={data.user} {notes} />
  {/if}

  {@render children()}
</div>
