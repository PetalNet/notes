<script lang="ts">
  import "katex/dist/katex.min.css";

  import { EditorView } from "@codemirror/view";
  import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListOrdered,
    Strikethrough,
  } from "lucide-svelte";
  import Codemirror from "./Codemirror.svelte";
  import {
    coreExtensions,
    insertAtLineStart,
    wrapSelection,
  } from "./Editor.ts";

  interface Props {
    content: string;
    onchange: (newContent: string) => void;
  }

  let { content, onchange }: Props = $props();

  // svelte-ignore non_reactive_update
  let editorView: EditorView;

  /** Custom theme */
  const editorTheme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "16px",
      fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
      backgroundColor: "#ffffff",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.5",
      overflow: "auto",
      padding: "16px",
    },
    ".cm-gutter": {
      minWidth: "10px",
    },
    ".cm-content": {
      height: "100%",
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
  });

  const extensions = [
    coreExtensions,
    // Update listener
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        console.log("[Prosemark] Content updated:", newContent.slice(0, 50));
        onchange(newContent);
      }
    }),
    editorTheme,
  ];

  // Update content if it changes externally (from Loro)
  $effect(() => {
    if (content !== editorView.state.doc.toString()) {
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
          onclick={() => wrapSelection(editorView, "**")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bold (Cmd+B)"
        >
          <Bold size={18} />
        </button>
        <button
          onclick={() => wrapSelection(editorView, "*")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Italic (Cmd+I)"
        >
          <Italic size={18} />
        </button>
        <button
          onclick={() => wrapSelection(editorView, "~~")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Strikethrough (Cmd+Shift+X)"
        >
          <Strikethrough size={18} />
        </button>
        <button
          onclick={() => wrapSelection(editorView, "`")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Code (Cmd+E)"
        >
          <Code size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => wrapSelection(editorView, "[", "](url)")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Link (Cmd+K)"
        >
          <Link size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => insertAtLineStart(editorView, "# ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          onclick={() => insertAtLineStart(editorView, "## ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          onclick={() => insertAtLineStart(editorView, "### ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => insertAtLineStart(editorView, "- ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          onclick={() => insertAtLineStart(editorView, "1. ")}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Numbered List"
        >
          <ListOrdered size={18} />
        </button>
      </div>
    </div>
  </div>

  <!-- Editor Content -->
  <Codemirror
    bind:editorView
    doc={content}
    {extensions}
    class="flex-1 overflow-y-auto"
  />
</div>
