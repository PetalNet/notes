import {
  Decoration,
  ViewPlugin,
  MatchDecorator,
  EditorView,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";
import { notes, selectNote } from "$lib/store.svelte.ts";
import type { RangeSet } from "@codemirror/state";

class WikilinkWidget extends WidgetType {
  constructor(readonly title: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-wikilink cursor-pointer text-primary underline";
    span.textContent = `[[${this.title}]]`;
    span.onclick = (e) => {
      e.preventDefault();
      const allNotes = notes;
      const targetNote = allNotes.find((n) => n.title === this.title);
      if (targetNote) {
        selectNote(targetNote.id);
      } else {
        console.log("Note not found:", this.title);
        // Optional: Create note if not found?
      }
    };
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]]+)\]\]/g,
  decoration: (match) =>
    Decoration.replace({
      widget: new WikilinkWidget(match[1]),
    }),
});

export const wikilinks = ViewPlugin.fromClass(
  class {
    bookmarks: RangeSet<Decoration>;
    constructor(view: EditorView) {
      this.bookmarks = wikilinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.bookmarks = wikilinkMatcher.updateDeco(update, this.bookmarks);
    }
  },
  {
    decorations: (instance) => instance.bookmarks,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.bookmarks || Decoration.none;
      }),
  },
);
