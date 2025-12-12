<script lang="ts">
  import { setSidebarContext } from "$lib/components/sidebar-context.ts";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";
  import { PersistedState } from "runed";

  let { children, data } = $props();

  const notesListQuery = $derived(getNotes());

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

    return isCollapsed;
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
    toggle: toggleSidebar,
  });

  const notesList = $derived(await notesListQuery);
</script>

<svelte:window bind:innerWidth onkeydown={handleKeydown} />

<div class="flex h-screen overflow-hidden">
  {#if data.user}
    <Sidebar user={data.user} {notesList} {isCollapsed} {toggleSidebar} />
  {/if}

  {@render children()}
</div>
