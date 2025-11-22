import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  markdownKeymap as langMdKeymap,
  markdown,
} from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";

// Helper function to wrap selection with markdown syntax
export function wrapSelection(
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
export function insertAtLineStart(view: EditorView, text: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: text },
    selection: { anchor: line.from + text.length },
  });
}

// Custom keyboard shortcuts for markdown formatting
export const markdownKeymap: KeyBinding[] = [
  ...langMdKeymap,

  { key: "Mod-b", run: (view) => wrapSelection(view, "**") }, // Bold
  { key: "Mod-i", run: (view) => wrapSelection(view, "*") }, // Italic
  { key: "Mod-k", run: (view) => wrapSelection(view, "[", "](url)") }, // Link
  { key: "Mod-e", run: (view) => wrapSelection(view, "`") }, // Inline code
  { key: "Mod-Shift-x", run: (view) => wrapSelection(view, "~~") }, // Strikethrough
];

export const coreExtensions = [
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
];
