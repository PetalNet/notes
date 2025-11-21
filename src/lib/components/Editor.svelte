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

  // Lucide icons
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

  // Prosemark imports
  import {
    prosemarkBasicSetup,
    prosemarkBaseThemeSetup,
    prosemarkMarkdownSyntaxExtensions,
  } from "@prosemark/core";

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
    const selectedText = view.state.doc.sliceString(from, to);

    if (selectedText.length === 0) {
      // No selection - insert markdown syntax and position cursor in the middle
      view.dispatch({
        changes: { from, to, insert: `${before}${after}` },
        selection: { anchor: from + before.length },
      });
    } else {
      // Has selection - wrap it and position cursor after
      view.dispatch({
        changes: { from, to, insert: `${before}${selectedText}${after}` },
        selection: {
          anchor: from + before.length + selectedText.length + after.length,
        },
      });
    }

    return true;
  }

  // Helper function to insert text at the start of the current line
  function insertAtLineStart(text: string) {
    if (!editorView) return;

    const { from } = editorView.state.selection.main;
    const line = editorView.state.doc.lineAt(from);

    editorView.dispatch({
      changes: { from: line.from, to: line.from, insert: text },
      selection: { anchor: line.from + text.length },
    });
  }

  // Custom keyboard shortcuts for markdown formatting
  const markdownKeymap = [
    { key: "Mod-b", run: (view: EditorView) => wrapSelection(view, "**") }, // Bold
    { key: "Mod-i", run: (view: EditorView) => wrapSelection(view, "*") }, // Italic
    {
      key: "Mod-k",
      run: (view: EditorView) => wrapSelection(view, "[", "](url)"),
    }, // Link
    { key: "Mod-e", run: (view: EditorView) => wrapSelection(view, "`") }, // Inline code
    {
      key: "Mod-Shift-x",
      run: (view: EditorView) => wrapSelection(view, "~~"),
    }, // Strikethrough
  ];

  onMount(() => {
    // Initialize CodeMirror with Prosemark (following official docs)
    editorView = new EditorView({
      doc: content,
      parent: editorElement,
      extensions: [
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
        // Basic prosemark extensions
        prosemarkBasicSetup(),
        // Theme extensions
        prosemarkBaseThemeSetup(),
        // History support
        history(),
        // Custom markdown keyboard shortcuts
        keymap.of(markdownKeymap),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // Update listener
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            console.log(
              "[Prosemark] Content updated:",
              newContent.slice(0, 50),
            );
            onchange(newContent);
          }
        }),
        // Custom theme
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "16px",
            fontFamily:
              "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
            backgroundColor: "#ffffff",
          },
          ".cm-scroller": {
            fontFamily: "inherit",
            lineHeight: "1.5",
            overflow: "auto",
            padding: "16px",
          },
          ".cm-content": {
            minHeight: "100px",
            maxWidth: "65ch",
            margin: "0 auto",
            caretColor: "var(--pm-cursor-color, black)",
            padding: "0",
          },
          ".cm-line": {
            padding: "0",
            lineHeight: "1.5",
          },
          "&.cm-focused": {
            outline: "none",
          },
        }),
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
  <!-- Formatting Toolbar -->
  <div class="border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
    <div class="flex items-center gap-1">
      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => editorView && wrapSelection(editorView, "**")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bold (Cmd+B)"
        >
          <Bold size={18} />
        </button>
        <button
          onclick={() => editorView && wrapSelection(editorView, "*")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Italic (Cmd+I)"
        >
          <Italic size={18} />
        </button>
        <button
          onclick={() => editorView && wrapSelection(editorView, "~~")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Strikethrough (Cmd+Shift+X)"
        >
          <Strikethrough size={18} />
        </button>
        <button
          onclick={() => editorView && wrapSelection(editorView, "`")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Code (Cmd+E)"
        >
          <Code size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => editorView && wrapSelection(editorView, "[", "](url)")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Link (Cmd+K)"
        >
          <Link size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => editorView && insertAtLineStart("# ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          onclick={() => editorView && insertAtLineStart("## ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          onclick={() => editorView && insertAtLineStart("### ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => editorView && insertAtLineStart("- ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          onclick={() => editorView && insertAtLineStart("1. ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Numbered List"
        >
          <ListOrdered size={18} />
        </button>
      </div>
    </div>
  </div>

  <!-- Editor Content -->
  <div bind:this={editorElement} class="flex-1 overflow-y-auto"></div>
</div>

<style>
  /* Additional Prosemark styling */
  :global(.cm-editor) {
    height: 100%;
  }
</style>
