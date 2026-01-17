<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import { navigating } from "$app/state";
  import favicon from "$lib/assets/favicon.svg";
  import { LoaderCircle } from "@lucide/svelte";
  import { fade } from "svelte/transition";

  let { children } = $props();
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

{#if navigating.to}
  <div class="fixed z-10 h-full w-full" in:fade={{ duration: 150 }}>
    <div
      class="absolute z-10 h-full w-full bg-white opacity-50 dark:bg-primary"
    ></div>
    <div
      class="absolute z-20 flex h-full w-full flex-col items-center justify-center gap-2"
    >
      <LoaderCircle class="animate-spin" />
      <div class="text-xs">
        {navigating.from?.url.pathname} → {navigating.to.url.pathname}
        ({navigating.type})
      </div>
    </div>
  </div>
{/if}

{@render children()}
