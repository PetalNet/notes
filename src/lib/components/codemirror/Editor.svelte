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
    boldCommand,
    italicCommand,
    strikethroughCommand,
    codeCommand,
    linkCommand,
    heading1Command,
    heading2Command,
    heading3Command,
    bulletListCommand,
    orderedListCommand,
  } from "./Editor.ts";
  import Toolbar from "./Toolbar.svelte";
  import { wikilinksExtension } from "$lib/editor/wikilinks.ts";
  import type { NoteOrFolder } from "$lib/schema.ts";

  interface Props {
    content: string;
    onchange: (newContent: string) => void;
    notesList?: NoteOrFolder[];
  }

  let { content, onchange, notesList = [] }: Props = $props();

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
    wikilinksExtension(notesList),
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

  const tools = [
    [
      {
        title: "Bold (⌘+B)",
        onclick: () => boldCommand(editorView),
        icon: Bold,
      },
      {
        title: "Italic (⌘+I)",
        onclick: () => italicCommand(editorView),
        icon: Italic,
      },
      {
        title: "Strikethrough (⌘+Shift+X)",
        onclick: () => strikethroughCommand(editorView),
        icon: Strikethrough,
      },
      {
        title: "Code (⌘+E)",
        onclick: () => codeCommand(editorView),
        icon: Code,
      },
    ],
    [
      {
        title: "Link (⌘+K)",
        onclick: () => linkCommand(editorView),
        icon: Link,
      },
    ],
    [
      {
        title: "Heading 1",
        onclick: () => heading1Command(editorView),
        icon: Heading1,
      },
      {
        title: "Heading 2",
        onclick: () => heading2Command(editorView),
        icon: Heading2,
      },
      {
        title: "Heading 3",
        onclick: () => heading3Command(editorView),
        icon: Heading3,
      },
    ],
    [
      {
        onclick: () => bulletListCommand(editorView),
        title: "Bullet List",

        icon: List,
      },
      {
        onclick: () => orderedListCommand(editorView),
        title: "Numbered List",

        icon: ListOrdered,
      },
    ],
  ];
</script>

<div class="flex h-full flex-col">
  <Toolbar {tools} />

  <Codemirror
    bind:editorView
    doc={content}
    {extensions}
    class="flex-1 overflow-y-auto"
  />
</div>
