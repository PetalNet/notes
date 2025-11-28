<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import favicon from "$lib/assets/favicon.svg";

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

{@render children()}
