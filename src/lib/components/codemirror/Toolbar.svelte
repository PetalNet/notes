<script lang="ts">
  import { type Icon as IconType } from "@lucide/svelte";

  interface Tool {
    title: string;
    onclick: () => void;
    icon: typeof IconType;
  }

  type Toolset = Tool[];

  interface Props {
    tools: Toolset[];
  }

  const { tools }: Props = $props();
</script>

<div
  class="flex items-center gap-1 border-b border-base-content/10 px-2 py-1.5 sm:gap-2 sm:px-4"
>
  {#each tools as toolset, index (index)}
    <div class="flex items-center gap-0.5 rounded-lg p-0.5">
      {#each toolset as tool (tool.title)}
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
    <div class="mx-0.5 h-5 w-px bg-base-300 last:hidden sm:mx-1"></div>
  {/each}
</div>
