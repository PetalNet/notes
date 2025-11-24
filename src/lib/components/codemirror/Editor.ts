import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBasicSetup,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import {
  pastePlainTextExtension,
  pasteRichTextExtension,
} from "@prosemark/paste-rich-text";
import { htmlBlockExtension } from "@prosemark/render-html";

// Helper function to wrap selection with markdown syntax
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string = before,
): void {
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
}

// Helper function to insert text at the start of the current line
export function insertAtLineStart(view: EditorView, text: string): void {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: text },
    selection: { anchor: line.from + text.length },
  });
}

/** Custom keyboard shortcuts for markdown formatting. */
export const markdownKeymap: KeyBinding[] = [
  {
    // Bold
    key: "Mod-b",
    run: (view) => {
      wrapSelection(view, "**");

      return true;
    },
  },
  {
    // Italic
    key: "Mod-i",
    run: (view) => {
      wrapSelection(view, "*");

      return true;
    },
  },
  {
    // Link
    key: "Mod-k",
    run: (view) => {
      wrapSelection(view, "[", "](url)");

      return true;
    },
  },
  {
    // Inline code
    key: "Mod-e",
    run: (view) => {
      wrapSelection(view, "`");

      return true;
    },
  },
  {
    // Strikethrough
    key: "Mod-Shift-x",
    run: (view) => {
      wrapSelection(view, "~~");

      return true;
    },
  },
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
  htmlBlockExtension,
  pasteRichTextExtension(),
  pastePlainTextExtension(),
  // Custom markdown keyboard shortcuts
  keymap.of(markdownKeymap),
];
