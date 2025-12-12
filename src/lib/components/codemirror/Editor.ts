import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  EditorView,
  keymap,
  type Command,
  type KeyBinding,
} from "@codemirror/view";
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
import { Url } from "@effect/platform";
import { Either } from "effect";

/**
 * Wrap current editor selection with markdown syntax.
 */
function wrapSelection(
  view: EditorView,
  before: string,
  after: string = before,
  selection: { from: number; to: number } = view.state.selection.main,
): void {
  const { from, to } = selection;
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

/**
 * {@linkcode wrapSelection}, but it unwraps if already wrapped.
 */
function toggleWrapper(
  view: EditorView,
  before: string,
  after: string = before,
): void {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;

  // Check if wrapped
  if (from >= before.length && to + after.length <= doc.length) {
    const beforeRange = doc.sliceString(from - before.length, from);
    const afterRange = doc.sliceString(to, to + after.length);

    if (beforeRange === before && afterRange === after) {
      // Unwrap
      view.dispatch({
        changes: [
          { from: from - before.length, to: from, insert: "" },
          { from: to, to: to + after.length, insert: "" },
        ],
        selection: {
          anchor: from - before.length,
          head: to - before.length,
        },
      });
      return;
    }
  }

  wrapSelection(view, before, after, { from, to });
}

/**
 * Insert text at the start of the current line.
 */
function insertAtLineStart(view: EditorView, text: string): void {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: text },
    selection: { anchor: line.from + text.length },
  });
}

function commandToKeyRun(command: (target: EditorView) => void): Command {
  return (view: EditorView) => {
    command(view);
    return true;
  };
}

export const boldCommand = (view: EditorView) => {
  toggleWrapper(view, "**");
};

export const italicCommand = (view: EditorView) => {
  toggleWrapper(view, "*");
};

export const codeCommand = (view: EditorView) => {
  toggleWrapper(view, "`");
};

export const strikethroughCommand = (view: EditorView) => {
  toggleWrapper(view, "~~");
};

export const linkCommand = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(from, to);

  Url.fromString(selectedText).pipe(
    Either.match({
      onLeft: () => {
        wrapSelection(view, "[", "](url)", { from, to });
      },
      onRight: () => {
        wrapSelection(view, "[title](", ")", { from, to });
      },
    }),
  );
};

function headingCommandFactory(count: number) {
  return (view: EditorView) => {
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);

    const match = /^(#{1,6})\s/.exec(line.text);

    if (match) {
      const currentCount = match[1]?.length;
      const end = line.from + match[0].length;

      if (currentCount === count) {
        // Remove heading
        view.dispatch({
          changes: { from: line.from, to: end, insert: "" },
        });
      } else {
        // Change heading level
        view.dispatch({
          changes: {
            from: line.from,
            to: end,
            insert: "#".repeat(count) + " ",
          },
        });
      }
    } else {
      insertAtLineStart(view, "#".repeat(count) + " ");
    }
  };
}

export const heading1Command = headingCommandFactory(1);
export const heading2Command = headingCommandFactory(2);
export const heading3Command = headingCommandFactory(3);

export const bulletListCommand = (view: EditorView) => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  const match = /^-\s/.exec(line.text);

  if (match) {
    const end = line.from + 2;

    // Remove bullet
    view.dispatch({
      changes: { from: line.from, to: end, insert: "" },
    });
  } else {
    insertAtLineStart(view, "- ");
  }
};

export const orderedListCommand = (view: EditorView) => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  const match = /^\d+.\s/.exec(line.text);

  if (match) {
    const end = line.from + 2;

    // Remove list
    view.dispatch({
      changes: { from: line.from, to: end, insert: "" },
    });
  } else {
    insertAtLineStart(view, "1. ");
  }
};

/** Custom keyboard shortcuts for markdown formatting. */
const markdownKeymap: KeyBinding[] = [
  {
    // Bold
    key: "Mod-b",
    run: commandToKeyRun(boldCommand),
  },
  {
    // Italic
    key: "Mod-i",
    run: commandToKeyRun(italicCommand),
  },
  {
    // Link
    key: "Mod-k",
    run: commandToKeyRun(linkCommand),
  },
  {
    // Inline code
    key: "Mod-e",
    run: commandToKeyRun(codeCommand),
  },
  {
    // Strikethrough
    key: "Mod-Shift-x",
    run: commandToKeyRun(strikethroughCommand),
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
