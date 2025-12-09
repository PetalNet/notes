<script lang="ts">
  import {
    Ellipsis,
    type Icon as IconType,
    PanelLeftOpen,
  } from "@lucide/svelte";
  import { getSidebarContext } from "$lib/components/sidebar-context";

  interface Tool {
    title: string;
    onclick: () => void;
    icon: typeof IconType;
  }

  interface ToolGroup {
    tools: Tool[];
    label?: string;
    priority: number; // 1 = highest (always visible), 2 = medium, 3 = lowest (first to hide)
  }

  interface Props {
    toolGroups: ToolGroup[];
  }

  const { toolGroups }: Props = $props();

  const sidebarCtx = getSidebarContext();

  // Sort groups by priority (lower number = higher priority)
  const sortedGroups = $derived(
    [...toolGroups].sort((a, b) => a.priority - b.priority),
  );
  const disappearableGroups = $derived(
    sortedGroups.filter((g) => g.priority > 1),
  );
</script>

<div
  class="@container flex items-center gap-1 border-b border-base-content/10 px-2 py-1.5 sm:gap-2 sm:px-4 last-of-type:[.division]:hidden"
>
  <!-- Sidebar toggle (when collapsed) -->
  {#if sidebarCtx.isCollapsed}
    <button
      onclick={sidebarCtx.toggleSidebar}
      class="btn h-8 min-h-8 w-8 p-0 btn-ghost btn-sm hover:bg-base-200"
      title="Open sidebar (Ctrl+\)"
      aria-label="Open sidebar"
    >
      <PanelLeftOpen size={16} class="sm:h-[18px] sm:w-[18px]" />
    </button>
    <div class="mx-0.5 h-5 w-px bg-base-300 sm:mx-1"></div>
  {/if}

  <!-- Tool groups with priority-based visibility -->
  {#each sortedGroups as group, i (group.label ?? group.priority)}
    {@const isLast = i === sortedGroups.length - 1}
    {@const priorityClass =
      group.priority === 1
        ? ""
        : group.priority === 2
          ? "hidden @md:flex"
          : "hidden @lg:flex"}
    <div class="flex items-center gap-0.5 rounded-lg p-0.5 {priorityClass}">
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
    {#if !isLast}
      <div
        class="division mx-0.5 h-5 w-px bg-base-300 sm:mx-1 {priorityClass}"
      ></div>
    {/if}
  {/each}

  <!-- Overflow dropdown - visible when lower priority items are hidden -->
  <div class="dropdown dropdown-end @lg:hidden">
    <div
      tabindex="0"
      role="button"
      class="btn h-8 min-h-8 w-8 p-0 btn-ghost btn-sm hover:bg-base-200"
      title="More tools"
      aria-label="More tools"
    >
      <Ellipsis size={16} class="sm:h-[18px] sm:w-[18px]" />
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <ul
      tabindex="0"
      class="dropdown-content menu z-10 w-52 rounded-box bg-base-200 p-2 shadow"
    >
      {#each disappearableGroups as group, i (group.label ?? group.priority)}
        {@const isLast = i < disappearableGroups.length - 1}

        {#if group.label}
          <li class="menu-title">
            <span>{group.label}</span>
          </li>
        {/if}
        {#each group.tools as tool (tool.title)}
          {@const Icon = tool.icon}
          <li>
            <button onclick={tool.onclick} class="flex items-center gap-2">
              <Icon size={16} />
              <span>{tool.title}</span>
            </button>
          </li>
        {/each}
        {#if isLast}
          <li class="my-1 rounded-none"><hr /></li>
        {/if}
      {/each}
    </ul>
  </div>
</div>
