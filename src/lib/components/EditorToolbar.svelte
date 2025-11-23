<script lang="ts">
  import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
  } from "lucide-svelte";

  let { onCommand }: { onCommand: (command: string, payload?: any) => void } =
    $props();
</script>

<div class="border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
  <div class="flex items-center gap-1">
    <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
      <button
        onclick={() => onCommand("bold")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Bold (Cmd+B)"
      >
        <Bold size={18} />
      </button>
      <button
        onclick={() => onCommand("italic")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Italic (Cmd+I)"
      >
        <Italic size={18} />
      </button>
      <button
        onclick={() => onCommand("strikethrough")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Strikethrough"
      >
        <Strikethrough size={18} />
      </button>
      <button
        onclick={() => onCommand("code")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Code (Cmd+E)"
      >
        <Code size={18} />
      </button>
    </div>

    <div class="mx-2 h-6 w-px bg-gray-200"></div>

    <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
      <button
        onclick={() => onCommand("link")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Link (Cmd+K)"
      >
        <Link size={18} />
      </button>
    </div>

    <div class="mx-2 h-6 w-px bg-gray-200"></div>

    <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
      <button
        onclick={() => onCommand("heading", 1)}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Heading 1"
      >
        <Heading1 size={18} />
      </button>
      <button
        onclick={() => onCommand("heading", 2)}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Heading 2"
      >
        <Heading2 size={18} />
      </button>
      <button
        onclick={() => onCommand("heading", 3)}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Heading 3"
      >
        <Heading3 size={18} />
      </button>
    </div>

    <div class="mx-2 h-6 w-px bg-gray-200"></div>

    <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
      <button
        onclick={() => onCommand("bulletList")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Bullet List"
      >
        <List size={18} />
      </button>
      <button
        onclick={() => onCommand("orderedList")}
        class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
        title="Numbered List"
      >
        <ListOrdered size={18} />
      </button>
    </div>
  </div>
</div>
