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

<div class="flex items-center gap-2 border-b border-base-content/10 px-4 py-2">
  {#each tools as toolset, index (index)}
    <div class="flex items-center gap-0.5 rounded-lg bg-base-300 p-1 shadow">
      {#each toolset as tool (tool.title)}
        {@const Icon = tool.icon}
        <button onclick={tool.onclick} class="btn shadow" title={tool.title}>
          <Icon size={18} />
        </button>
      {/each}
    </div>
    <div class="mx-2 h-6 w-px bg-base-content last:hidden"></div>
  {/each}
</div>
