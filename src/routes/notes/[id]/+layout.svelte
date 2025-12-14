<script lang="ts">
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getCurrentUser } from "$lib/remote/accounts.remote.ts";
  import Error from "./+error.svelte";

  let { children } = $props();

  const user = $derived(await getCurrentUser());
</script>

<div class="flex h-screen overflow-hidden">
  {#if user}<Sidebar {user} />{/if}
  <svelte:boundary>
    {@render children()}

    {#snippet failed(error)}
      <Error {error} />
    {/snippet}
  </svelte:boundary>
</div>
