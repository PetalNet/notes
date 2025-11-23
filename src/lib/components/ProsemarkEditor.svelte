<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "katex/dist/katex.min.css";

  // CodeMirror imports
  import { EditorView, keymap } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import { GFM } from "@lezer/markdown";

  // Prosemark imports
  import {
    prosemarkBasicSetup,
    prosemarkMarkdownSyntaxExtensions,
  } from "@prosemark/core";
  import EditorToolbar from "./EditorToolbar.svelte";

  let {
    content,
    onchange,
  }: { content: string; onchange: (newContent: string) => void } = $props();

  let editorElement: HTMLElement;
  let editorView: EditorView = $state()!;

  // Helper function to wrap selection with markdown syntax
  function wrapSelection(
    view: EditorView,
    before: string,
    after: string = before,
  ) {
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `${before}${selectedText}${after}` },
      selection: { anchor: from + before.length + selectedText.length },
    });
    view.focus();
  }

  // Helper function to insert text at the start of the current line
  function insertAtLineStart(text: string) {
    if (!editorView) return;
    const { from } = editorView.state.selection.main;
    const line = editorView.state.doc.lineAt(from);
    editorView.dispatch({
      changes: { from: line.from, insert: text },
      selection: { anchor: line.from + text.length },
    });
    editorView.focus();
  }

  function handleCommand(command: string, payload?: any) {
    if (!editorView) return;

    switch (command) {
      case "bold":
        wrapSelection(editorView, "**");
        break;
      case "italic":
        wrapSelection(editorView, "*");
        break;
      case "strikethrough":
        wrapSelection(editorView, "~~");
        break;
      case "code":
        wrapSelection(editorView, "`");
        break;
      case "link":
        wrapSelection(editorView, "[", "](url)");
        break;
      case "heading":
        const level = payload || 1;
        insertAtLineStart("#".repeat(level) + " ");
        break;
      case "bulletList":
        insertAtLineStart("- ");
        break;
      case "orderedList":
        insertAtLineStart("1. ");
        break;
    }
  }

  // Custom keyboard shortcuts for markdown formatting
  const markdownKeymap = [
    {
      key: "Mod-b",
      run: (view: EditorView) => {
        wrapSelection(view, "**");
        return true;
      },
    }, // Bold
    {
      key: "Mod-i",
      run: (view: EditorView) => {
        wrapSelection(view, "*");
        return true;
      },
    }, // Italic
    {
      key: "Mod-k",
      run: (view: EditorView) => {
        wrapSelection(view, "[", "](url)");
        return true;
      },
    }, // Link
    {
      key: "Mod-e",
      run: (view: EditorView) => {
        wrapSelection(view, "`");
        return true;
      },
    }, // Inline code
    {
      key: "Mod-Shift-x",
      run: (view: EditorView) => {
        wrapSelection(view, "~~");
        return true;
      },
    }, // Strikethrough
  ];

  onMount(() => {
    console.log("[Prosemark] Initial content:", JSON.stringify(content));

    // Initialize CodeMirror with Prosemark - minimal setup, no default styling
    editorView = new EditorView({
      doc: content,
      parent: editorElement,
      extensions: [
        // Custom markdown keyboard shortcuts - MUST come first to override defaults
        keymap.of(markdownKeymap),
        // Adds support for the Markdown language
        markdown({
          // adds support for standard syntax highlighting inside code fences
          codeLanguages: languages,
          extensions: [
            // GitHub Flavored Markdown (support for autolinks, strikethroughs)
            GFM,
            // additional parsing tags for existing markdown features, backslash escapes, emojis
            ...prosemarkMarkdownSyntaxExtensions,
          ],
        }),
        // Basic prosemark extensions (markdown hiding, etc.)
        prosemarkBasicSetup(),
        // History support
        history(),
        // Default keymaps come after custom ones
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // Update listener
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            console.log(
              "[Prosemark] Content updated:",
              JSON.stringify(newContent),
            );
            onchange(newContent);
          }
        }),
        // Disable line wrapping to preserve exact newlines
        EditorView.lineWrapping,
      ],
    });
  });

  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
    }
  });

  // Update content if it changes externally (from Loro)
  $effect(() => {
    if (editorView && content !== editorView.state.doc.toString()) {
      console.log("[Prosemark] External content update");
      console.log("[Prosemark] New content:", JSON.stringify(content));
      console.log(
        "[Prosemark] Current content:",
        JSON.stringify(editorView.state.doc.toString()),
      );
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: content,
        },
      });
    }
  });
</script>

<div class="flex h-full flex-col bg-white">
  <EditorToolbar onCommand={handleCommand} />
  <!-- Editor Content -->
  <div
    bind:this={editorElement}
    class="custom-editor flex-1 overflow-y-auto"
  ></div>
</div>

<style>
  /* Shared editor styles */
  .custom-editor {
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif;
    font-size: 16px;
    line-height: 1.5;
    padding: 16px;
  }

  /* Force font on all CodeMirror content */
  :global(.cm-content),
  :global(.cm-line) {
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif !important;
    font-size: 16px !important;
    line-height: 1.5 !important;
  }

  :global(.cm-content) {
    padding: 0 !important;
  }

  /* Hide all CodeMirror UI elements */
  :global(.cm-gutters) {
    display: none !important;
  }

  :global(.cm-lineNumbers) {
    display: none !important;
  }

  :global(.cm-foldGutter) {
    display: none !important;
  }

  /* Remove left padding from lines */
  :global(.cm-line) {
    padding-left: 0 !important;
  }
</style>
