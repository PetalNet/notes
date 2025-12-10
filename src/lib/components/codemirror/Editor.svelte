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
    Clock,
  } from "@lucide/svelte";
  import { LoroExtensions } from "loro-codemirror";
  import Codemirror from "./Codemirror.svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";
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
  import type { NoteOrFolder, User } from "$lib/schema.ts";
  import { LoroNoteManager } from "$lib/loro.ts";
  import { EphemeralStore, UndoManager } from "loro-crdt";
  import type { Extension } from "@codemirror/state";
  import { onDestroy } from "svelte";

  interface Props {
    manager: LoroNoteManager | undefined;
    notesList?: NoteOrFolder[];
    user: User | undefined;
  }

  let { manager, notesList = [], user }: Props = $props();

  // svelte-ignore non_reactive_update
  let editorView: EditorView;
  let isHistoryOpen = $state(false);

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

  let loroExtensions = $state<Extension>([]);

  $effect.pre(() => {
    if (manager !== undefined && user !== undefined) {
      const ephemeral = new EphemeralStore();
      const undoManager = new UndoManager(manager.doc, {});

      onDestroy(() => {
        ephemeral.destroy();
      });

      loroExtensions = LoroExtensions(
        manager.doc,
        {
          ephemeral,
          user: { name: user.username, colorClassName: "bg-primary" },
        },
        undoManager,
        LoroNoteManager.getTextFromDoc,
      );
    }
  });

  const extensions: Extension[] = $derived([
    coreExtensions,
    wikilinksExtension(notesList),
    loroExtensions,
    editorTheme,
  ]);

  const tools = [
    {
      priority: 1,
      tools: [
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
    },
    {
      priority: 2,
      tools: [
        {
          title: "Link (⌘+K)",
          onclick: () => linkCommand(editorView),
          icon: Link,
        },
      ],
    },
    {
      priority: 10,
      label: "Headings",
      tools: [
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
    },
    {
      priority: 5,
      label: "Lists",
      tools: [
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
    },
    {
      priority: 100,
      tools: [
        {
          onclick: () => (isHistoryOpen = !isHistoryOpen),
          title: "Version History",
          icon: Clock,
        },
      ],
    },
  ];
</script>

<div class="relative flex h-full flex-col">
  <Toolbar toolGroups={tools} />

  <Codemirror bind:editorView {extensions} class="flex-1 overflow-y-auto" />

  <HistoryPanel {manager} bind:isOpen={isHistoryOpen} />
</div>
