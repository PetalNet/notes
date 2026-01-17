import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import type { NoteOrFolder } from "$lib/schema.ts";
import type { RangeSet } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";

class WikilinkWidget extends WidgetType {
  title: string;
  notesList: NoteOrFolder[];

  constructor(title: string, notesList: NoteOrFolder[]) {
    super();

    this.title = title;
    this.notesList = notesList;
  }

  override toDOM(): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "cursor-pointer text-primary underline";
    a.textContent = `[[${this.title}]]`;
    a.onclick = (e) => {
      e.preventDefault();
      const targetNote = this.notesList.find((n) => n.title === this.title);
      if (targetNote) {
        goto(resolve("/notes/[id]", { id: targetNote.id }));
      } else {
        // TODO: Show a toast notification?
        console.debug("Note not found:", this.title);
        // Optional: Create note if not found?
      }
    };
    return a;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export interface WikilinkPluginArgs {
  notesList: NoteOrFolder[];
}

export const wikilinksExtension: ViewPlugin<
  WikilinkPlugin,
  WikilinkPluginArgs
> = ViewPlugin.define(
  (v, { notesList }) => {
    const wikilinkMatcher = new MatchDecorator({
      regexp: /\[\[([^\]]+)\]\]/g,
      decoration: (match) =>
        Decoration.replace({
          widget: new WikilinkWidget(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- There is a capture group in the regex.
            match[1]!,
            notesList,
          ),
        }),
    });

    return new WikilinkPlugin(v, wikilinkMatcher);
  },
  {
    decorations: (instance) => instance.bookmarks,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.bookmarks ?? Decoration.none;
      }),
  },
);

class WikilinkPlugin {
  bookmarks: RangeSet<Decoration>;
  wikilinkMatcher: MatchDecorator;
  constructor(view: EditorView, wikilinkMatcher: MatchDecorator) {
    this.bookmarks = wikilinkMatcher.createDeco(view);
    this.wikilinkMatcher = wikilinkMatcher;
  }
  update(update: ViewUpdate): void {
    this.bookmarks = this.wikilinkMatcher.updateDeco(update, this.bookmarks);
  }
}
