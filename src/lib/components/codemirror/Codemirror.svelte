<script lang="ts">
  import { browser } from "$app/environment";
  import type { Extension } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { onMount, onDestroy } from "svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    extensions: Extension | undefined;
    class?: ClassValue;
    editorView: EditorView;
  }

  let { extensions = [], editorView = $bindable(), ...props }: Props = $props();

  let editorElement: HTMLElement;

  onMount(() => {
    // Initialize CodeMirror
    editorView = new EditorView({
      parent: editorElement,
      extensions: extensions,
    });
  });

  onDestroy(() => {
    if (browser) editorView.destroy();
  });
</script>

<div bind:this={editorElement} class={props.class}></div>
