import {
  Decoration,
  ViewPlugin,
  MatchDecorator,
  EditorView,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";
import { notes } from "$lib/store.svelte.ts";
import type { RangeSet } from "@codemirror/state";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";

class WikilinkWidget extends WidgetType {
  title: string;

  constructor(title: string) {
    super();

    this.title = title;
  }

  toDOM() {
    const a = document.createElement("a");
    a.className = "cursor-pointer text-primary underline";
    a.textContent = `[[${this.title}]]`;
    a.onclick = (e) => {
      e.preventDefault();
      const allNotes = notes;
      const targetNote = allNotes.notesList.find((n) => n.title === this.title);
      if (targetNote) {
        goto(resolve("/notes/[id]", { id: targetNote.id }));
      } else {
        console.log("Note not found:", this.title);
        // Optional: Create note if not found?
      }
    };
    return a;
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
        return view.plugin(plugin)?.bookmarks ?? Decoration.none;
      }),
  },
);
