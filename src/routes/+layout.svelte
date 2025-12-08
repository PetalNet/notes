<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import favicon from "$lib/assets/favicon.svg";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";

  let { children, data } = $props();

  const notesList = $derived(data.user ? await getNotes() : []);

  onNavigate((navigation) => {
    const { promise, resolve } = Promise.withResolvers<void>();

    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });

    return promise;
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
  <div class="flex h-screen overflow-hidden">
    <Sidebar user={data.user} {notesList} />
    <div class="flex-1 overflow-auto">
      {@render children()}
    </div>
  </div>
{:else}
  {@render children()}
{/if}
