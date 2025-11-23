<script lang="ts">
  import { store } from "$lib/store.svelte";
  import ProsemarkEditor from "./ProsemarkEditor.svelte";
  import MilkdownEditor from "./MilkdownEditor.svelte";

  let {
    content,
    onchange,
  }: { content: string; onchange: (newContent: string) => void } = $props();
</script>

<div class="h-full w-full">
  {#if store.editorMode === "prosemark"}
    <ProsemarkEditor {content} {onchange} />
  {:else}
    <MilkdownEditor {content} {onchange} />
  {/if}
</div>
