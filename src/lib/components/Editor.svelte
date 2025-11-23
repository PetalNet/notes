<script lang="ts">
  import { store } from "$lib/store.svelte.ts";
  import ProsemarkEditor from "./ProsemarkEditor.svelte";
  import MilkdownEditor from "./MilkdownEditor.svelte";

  let {
    content,
    onchange,
  }: { content: string; onchange: (newContent: string) => void } = $props();

  $effect(() => {
    console.log("Editor component mounted/updated. Mode:", store.editorMode);
  });
</script>

<div class="h-full w-full">
  {#if store.editorMode === "prosemark"}
    <ProsemarkEditor {content} {onchange} />
  {:else}
    <MilkdownEditor {content} {onchange} />
  {/if}
</div>
