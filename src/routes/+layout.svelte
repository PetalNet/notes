<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import favicon from "$lib/assets/favicon.svg";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";
  import { setSidebarContext } from "$lib/components/sidebar-context.js";
  import { PersistedState } from "runed";

  let { children, data } = $props();

  // User's explicit preference (persisted to localStorage)
  const collapsedDesktop = new PersistedState("sidebarCollapsed", false);
  // Mobile state (always starts collapsed)
  let collapsedMobile = $state(true);

  // Track window width
  let innerWidth = $state(0);
  let isDesktop = $derived(innerWidth >= 768);

  // Derived visual state
  let isCollapsed = $derived(
    isDesktop ? collapsedDesktop.current : collapsedMobile,
  );

  // Handle transitions between breakpoints
  let wasDesktop = $state(true);

  $effect(() => {
    if (innerWidth === 0) return;

    // Desktop -> Mobile: Always collapse
    if (wasDesktop && !isDesktop) {
      collapsedMobile = true;
    }

    // Mobile -> Desktop: If mobile was open, keep open
    if (!wasDesktop && isDesktop) {
      if (!collapsedMobile) {
        collapsedDesktop.current = false;
      }
    }

    wasDesktop = isDesktop;
  });

  function toggleSidebar() {
    if (isDesktop) {
      collapsedDesktop.current = !collapsedDesktop.current;
    } else {
      collapsedMobile = !collapsedMobile;
    }
  }

  // Keyboard shortcut: Ctrl+\ (or Cmd+\ on Mac)
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
      e.preventDefault();
      toggleSidebar();
    }
  }

  setSidebarContext({
    get isCollapsed() {
      return isCollapsed;
    },
    toggleSidebar,
  });

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

<svelte:window bind:innerWidth onkeydown={handleKeydown} />

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
  <div class="flex h-screen overflow-hidden">
    <Sidebar user={data.user} {notesList} {isCollapsed} {toggleSidebar} />
    <div class="flex-1 overflow-auto">
      {@render children()}
    </div>
  </div>
{:else}
  {@render children()}
{/if}
