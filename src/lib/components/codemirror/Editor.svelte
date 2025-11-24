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
  } from "@lucide/svelte";
  import Codemirror from "./Codemirror.svelte";
  import {
    coreExtensions,
    insertAtLineStart,
    wrapSelection,
  } from "./Editor.ts";
  import Toolbar from "./Toolbar.svelte";

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
      padding: "0",

      // ProseMark syntax highlighting
      "--pm-header-mark-color": "var(--color-primary)",
      "--pm-link-color": "var(--color-primary)",
      "--pm-muted-color":
        "color-mix(in srgb, var(--color-base-content), transparent 50%)",
      "--pm-code-background-color": "var(--color-base-200)",
      "--pm-code-btn-background-color": "var(--color-base-300)",
      "--pm-code-btn-hover-background-color": "var(--color-base-content)",
      "--pm-blockquote-vertical-line-background-color": "var(--color-base-300)",
      "--pm-syntax-link": "var(--color-primary)",
      "--pm-syntax-keyword": "var(--color-secondary)",
      "--pm-syntax-atom": "var(--color-accent)",
      "--pm-syntax-literal": "var(--color-accent)",
      "--pm-syntax-string": "var(--color-success)",
      "--pm-syntax-regexp": "var(--color-warning)",
      "--pm-syntax-definition-variable": "var(--color-base-content)",
      "--pm-syntax-local-variable": "var(--color-base-content)",
      "--pm-syntax-type-namespace": "var(--color-secondary)",
      "--pm-syntax-class-name": "var(--color-secondary)",
      "--pm-syntax-special-variable-macro": "var(--color-accent)",
      "--pm-syntax-definition-property": "var(--color-base-content)",
      "--pm-syntax-comment":
        "color-mix(in srgb, var(--color-base-content), transparent 50%)",
      "--pm-syntax-invalid": "var(--color-error)",
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
        console.log(
          "[Prosemark] Content updated. Preview:",
          newContent.slice(0, 50),
        );
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

<div class="flex h-full flex-col">
  <Toolbar
    tools={[
      [
        {
          title: "Bold (Cmd+B)",
          onclick: () => wrapSelection(editorView, "**"),
          icon: Bold,
        },
        {
          title: "Italic (Cmd+I)",
          onclick: () => wrapSelection(editorView, "*"),
          icon: Italic,
        },
        {
          title: "Strikethrough (Cmd+Shift+X)",
          onclick: () => wrapSelection(editorView, "~~"),
          icon: Strikethrough,
        },
        {
          title: "Code (Cmd+E)",
          onclick: () => wrapSelection(editorView, "`"),
          icon: Code,
        },
      ],
      [
        {
          title: "Link (Cmd+K)",
          onclick: () => wrapSelection(editorView, "[", "](url)"),
          icon: Link,
        },
      ],
      [
        {
          title: "Heading 1",
          onclick: () => insertAtLineStart(editorView, "# "),
          icon: Heading1,
        },
        {
          title: "Heading 2",
          onclick: () => insertAtLineStart(editorView, "## "),
          icon: Heading2,
        },
        {
          title: "Heading 3",
          onclick: () => insertAtLineStart(editorView, "### "),
          icon: Heading3,
        },
      ],
      [
        {
          onclick: () => insertAtLineStart(editorView, "- "),
          title: "Bullet List",

          icon: List,
        },
        {
          onclick: () => insertAtLineStart(editorView, "1. "),
          title: "Numbered List",

          icon: ListOrdered,
        },
      ],
    ]}
  />

  <Codemirror
    bind:editorView
    doc={content}
    {extensions}
    class="flex-1 overflow-y-auto"
  />
</div>
