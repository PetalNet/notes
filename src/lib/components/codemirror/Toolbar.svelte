<script lang="ts">
  import {
    type Icon as IconType,
    ChevronRight,
    ChevronDown,
    MoreHorizontal,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  interface Tool {
    title: string;
    onclick: () => void;
    icon: typeof IconType;
  }

  interface ToolGroup {
    tools: Tool[];
    label?: string; // Label for dropdown
    priority: number; // Higher priority = stays visible longer (1 = highest)
  }

  interface Props {
    toolGroups: ToolGroup[];
    toggleSidebar?: () => void;
    isCollapsed?: boolean;
  }

  const { toolGroups, toggleSidebar, isCollapsed = false }: Props = $props();

  let toolbarElement: HTMLDivElement;
  // Initialize with all groups visible by default
  let visibleGroups = $state<number[]>(toolGroups.map((_, i) => i));

  // Sort groups by priority (higher priority first)
  const sortedGroups = $derived(
    [...toolGroups].sort((a, b) => a.priority - b.priority),
  );

  // Determine which groups should be visible vs in dropdown
  const shouldShowAsButtons = $derived((groupIndex: number) => {
    return visibleGroups.includes(groupIndex);
  });

  const collapsedGroups = $derived(
    sortedGroups.filter((_, index) => !visibleGroups.includes(index)),
  );

  // Check available space and update visible groups
  function updateVisibleGroups() {
    if (!toolbarElement) return;

    const containerWidth = toolbarElement.clientWidth;
    const buttonWidth = 40; // Approximate width per button
    const groupSpacing = 12; // Spacing between groups
    const dropdownWidth = 40; // Width for overflow dropdown

    let availableWidth =
      containerWidth -
      (toggleSidebar && isCollapsed ? buttonWidth + groupSpacing : 0);
    let currentVisibleGroups: number[] = [];

    // Try to fit groups by priority
    for (let i = 0; i < sortedGroups.length; i++) {
      const group = sortedGroups[i];
      const groupWidth = group.tools.length * buttonWidth + groupSpacing;

      // Reserve space for dropdown if there are remaining groups
      const remainingGroups = sortedGroups.length - i - 1;
      const needsDropdown = remainingGroups > 0;
      const requiredWidth = groupWidth + (needsDropdown ? dropdownWidth : 0);

      if (availableWidth >= requiredWidth) {
        currentVisibleGroups.push(i);
        availableWidth -= groupWidth;
      } else {
        break; // No more space, rest go in dropdown
      }
    }

    visibleGroups = currentVisibleGroups;
  }

  onMount(() => {
    updateVisibleGroups();

    const resizeObserver = new ResizeObserver(() => {
      updateVisibleGroups();
    });

    if (toolbarElement) {
      resizeObserver.observe(toolbarElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  });
</script>

<div
  bind:this={toolbarElement}
  class="flex items-center gap-1 border-b border-base-content/10 px-2 py-1.5 sm:gap-2 sm:px-4"
>
  <!-- Sidebar toggle (when collapsed) -->
  {#if toggleSidebar && isCollapsed}
    <button
      onclick={toggleSidebar}
      class="btn h-8 min-h-8 w-8 p-0 btn-ghost btn-sm hover:bg-base-200"
      title="Open sidebar (Ctrl+\)"
      aria-label="Open sidebar"
    >
      <ChevronRight size={16} class="sm:h-[18px] sm:w-[18px]" />
    </button>
    <div class="mx-0.5 h-5 w-px bg-base-300 sm:mx-1"></div>
  {/if}

  <!-- Visible tool groups -->
  {#each sortedGroups as group, index (index)}
    {#if shouldShowAsButtons(index)}
      <div class="flex items-center gap-0.5 rounded-lg p-0.5">
        {#each group.tools as tool (tool.title)}
          {@const Icon = tool.icon}
          <button
            onclick={tool.onclick}
            class="btn h-8 min-h-8 w-8 p-0 btn-ghost btn-sm hover:bg-base-200"
            title={tool.title}
            aria-label={tool.title}
          >
            <Icon size={16} class="sm:h-[18px] sm:w-[18px]" />
          </button>
        {/each}
      </div>
      <div class="mx-0.5 h-5 w-px bg-base-300 sm:mx-1"></div>
    {/if}
  {/each}

  <!-- Overflow dropdown for collapsed groups -->
  {#if collapsedGroups.length > 0}
    <div class="dropdown dropdown-end">
      <button
        tabindex="0"
        role="button"
        class="btn h-8 min-h-8 w-8 p-0 btn-ghost btn-sm hover:bg-base-200"
        title="More tools"
        aria-label="More tools"
      >
        <MoreHorizontal size={16} class="sm:h-[18px] sm:w-[18px]" />
      </button>
      <ul
        tabindex="0"
        class="dropdown-content menu z-10 mt-1 w-52 rounded-box bg-base-200 p-2 shadow"
      >
        {#each collapsedGroups as group}
          {#if group.label}
            <li class="menu-title">
              <span>{group.label}</span>
            </li>
          {/if}
          {#each group.tools as tool}
            {@const Icon = tool.icon}
            <li>
              <button onclick={tool.onclick} class="flex items-center gap-2">
                <Icon size={16} />
                <span>{tool.title}</span>
              </button>
            </li>
          {/each}
          {#if group !== collapsedGroups[collapsedGroups.length - 1]}
            <li class="my-1"><hr /></li>
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
</div>
