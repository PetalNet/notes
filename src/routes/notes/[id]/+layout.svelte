<script>
  import Sidebar from "$lib/components/Sidebar.svelte";

  let { children, data } = $props();
</script>

<div class="flex h-screen overflow-hidden">
  {#if data.user}
    <Sidebar user={data.user} />
  {/if}

  {@render children()}
</div>
