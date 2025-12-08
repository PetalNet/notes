<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import favicon from "$lib/assets/favicon.svg";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";
  import { setContext } from "svelte";
  import { SIDEBAR_CONTEXT_KEY } from "$lib/components/sidebar-context";

  let { children, data } = $props();

  // Sidebar collapse state
  let isCollapsed = $state(false);

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
  }

  setContext(SIDEBAR_CONTEXT_KEY, {
    get isCollapsed() {
      return isCollapsed;
    },
    toggleSidebar,
  });

  const notesList = $derived(data.user ? await getNotes() : []);

  // Initialize from localStorage and handle responsive behavior
  onMount(() => {
    // Load saved state from localStorage
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) {
      isCollapsed = saved === "true";
    } else {
      // Auto-collapse on mobile screens
      isCollapsed = window.innerWidth < 768;
    }

    // Handle window resize for automatic collapse
    const handleResize = () => {
      if (window.innerWidth < 768 && !isCollapsed) {
        isCollapsed = true;
      }
    };

    window.addEventListener("resize", handleResize);

    // Keyboard shortcut: Ctrl+B (or Cmd+B on Mac)
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  // Save to localStorage whenever state changes
  $effect(() => {
    localStorage.setItem("sidebarCollapsed", String(isCollapsed));
  });

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
    <Sidebar user={data.user} {notesList} {isCollapsed} {toggleSidebar} />
    <div class="flex-1 overflow-auto">
      {@render children()}
    </div>
  </div>
{:else}
  {@render children()}
{/if}
