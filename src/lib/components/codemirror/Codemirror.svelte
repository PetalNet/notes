<script lang="ts">
  import { browser } from "$app/environment";
  import type { Extension, Text } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { onMount, onDestroy } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    doc: string | Text;
    extensions: Extension | undefined;
    class?: ClassValue;
    editorView: EditorView;
  }

  let {
    doc,
    extensions = [],
    editorView = $bindable(),
    ...props
  }: Props = $props();

  let editorElement: HTMLElement;

  onMount(() => {
    // Initialize CodeMirror
    editorView = new EditorView({
      doc,
      parent: editorElement,
      extensions: extensions,
    });
  });

  onDestroy(() => {
    if (browser) editorView.destroy();
  });
</script>

<div bind:this={editorElement} class={props.class}></div>
