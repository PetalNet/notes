<script lang="ts">
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getUser } from "$lib/remote/user.remote.ts";

  let { children } = $props();

  const user = $derived(await getUser());
</script>

<div class="flex h-screen overflow-hidden">
  {#if user}<Sidebar {user} />{/if}

  {@render children()}
</div>
