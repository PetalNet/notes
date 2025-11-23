<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Editor,
    rootCtx,
    defaultValueCtx,
    editorViewCtx,
    parserCtx,
    serializerCtx,
    remarkPluginsCtx,
  } from "@milkdown/core";
  import { commonmark } from "@milkdown/preset-commonmark";
  import { gfm } from "@milkdown/preset-gfm";
  import { listener, listenerCtx } from "@milkdown/plugin-listener";
  import { history, undoCommand, redoCommand } from "@milkdown/plugin-history";
  import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    toggleLinkCommand,
    wrapInHeadingCommand,
    wrapInBulletListCommand,
    wrapInOrderedListCommand,
  } from "@milkdown/preset-commonmark";
  import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
  import { callCommand } from "@milkdown/utils";
  import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
  } from "lucide-svelte";
  import EditorToolbar from "./EditorToolbar.svelte";

  let {
    content,
    onchange,
  }: { content: string; onchange: (newContent: string) => void } = $props();

  let editorElement: HTMLElement;
  let editor: Editor | undefined;
  let isInternalUpdate = false;

  function runCommand(command: any, payload?: any) {
    if (editor) {
      editor.action(callCommand(command, payload));
    }
  }

  function handleCommand(command: string, payload?: any) {
    switch (command) {
      case "bold":
        runCommand(toggleStrongCommand.key);
        break;
      case "italic":
        runCommand(toggleEmphasisCommand.key);
        break;
      case "strikethrough":
        runCommand(toggleStrikethroughCommand.key);
        break;
      case "code":
        runCommand(toggleInlineCodeCommand.key);
        break;
      case "link":
        runCommand(toggleLinkCommand.key);
        break;
      case "heading":
        runCommand(wrapInHeadingCommand.key, payload || 1);
        break;
      case "bulletList":
        runCommand(wrapInBulletListCommand.key);
        break;
      case "orderedList":
        runCommand(wrapInOrderedListCommand.key);
        break;
    }
  }

  onMount(async () => {
    console.log("[Milkdown] Initial content:", JSON.stringify(content));
    console.log(
      "[Milkdown] Newline count:",
      (content.match(/\n/g) || []).length,
    );

    // Preserve blank lines by converting them to empty paragraphs
    // \n\n\n = 2 blank lines, \n\n\n\n\n = 4 blank lines, etc.
    const processedContent = content.replace(/\n\n\n+/g, (match) => {
      const blankLineCount = match.length - 1;
      return "\n\n" + "&nbsp;\n\n".repeat(blankLineCount);
    });
    console.log(
      "[Milkdown] Processed content:",
      JSON.stringify(processedContent),
    );

    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorElement);
        ctx.set(defaultValueCtx, processedContent);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use((ctx) => {
        // Listener for content changes
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            console.log(
              "[Milkdown] Content updated:",
              JSON.stringify(markdown),
            );
            console.log(
              "[Milkdown] Newline count:",
              (markdown.match(/\n/g) || []).length,
            );
            // Remove the &nbsp; markers when sending back
            let cleanedMarkdown = markdown.replace(/&nbsp;\n\n/g, "\n\n");
            // Remove <br /> tags that Milkdown incorrectly adds (in any position)
            cleanedMarkdown = cleanedMarkdown.replace(/<br\s*\/?\s*>/g, "");
            // Clean up any resulting triple+ newlines back to double
            cleanedMarkdown = cleanedMarkdown.replace(/\n{3,}/g, "\n\n");
            isInternalUpdate = true;
            onchange(cleanedMarkdown);
            isInternalUpdate = false;
          }
        });
        return () => {};
      })
      .create();

    console.log("[Milkdown] Editor created");
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  // Handle external content updates
  $effect(() => {
    if (editor && !isInternalUpdate) {
      console.log(
        "[Milkdown] External content update:",
        JSON.stringify(content),
      );

      // Preserve blank lines
      const processedContent = content.replace(/\n\n\n+/g, (match) => {
        const blankLineCount = match.length - 1;
        return "\n\n" + "&nbsp;\n\n".repeat(blankLineCount);
      });
      console.log(
        "[Milkdown] Processed external content:",
        JSON.stringify(processedContent),
      );

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as any;
        const { state } = view;

        const parser = ctx.get(parserCtx);
        const tr = state.tr.replaceWith(
          0,
          state.doc.content.size,
          parser(processedContent),
        );
        view.dispatch(tr);
      });
    }
  });
</script>

<div class="flex h-full flex-col bg-white">
  <EditorToolbar onCommand={handleCommand} />
  <div
    bind:this={editorElement}
    class="custom-editor milkdown-container"
    onclick={(e) => {
      if (e.target === editorElement) {
        editor?.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          view.focus();
        });
      }
    }}
  ></div>
</div>

<style>
  /* Shared editor styles */
  .custom-editor {
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif;
    font-size: 16px;
    line-height: 1.5;
    padding: 16px;
  }

  /* Force font on all Milkdown/ProseMirror content */
  :global(.milkdown),
  :global(.ProseMirror),
  :global(.ProseMirror *) {
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif !important;
    font-size: 16px !important;
    line-height: 1.5 !important;
  }

  .milkdown-container {
    width: 100%;
    height: 100%;
  }

  /* Override Milkdown's default markdown styling */
  :global(.milkdown strong),
  :global(.milkdown b) {
    font-weight: inherit !important;
  }

  :global(.milkdown em),
  :global(.milkdown i) {
    font-style: inherit !important;
  }

  :global(.milkdown h1),
  :global(.milkdown h2),
  :global(.milkdown h3),
  :global(.milkdown h4),
  :global(.milkdown h5),
  :global(.milkdown h6) {
    font-size: inherit !important;
    font-weight: inherit !important;
    margin: 0 !important;
  }

  :global(.milkdown code) {
    background: none !important;
    padding: 0 !important;
    font-family: inherit !important;
  }

  :global(.milkdown ul),
  :global(.milkdown ol) {
    list-style: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Ensure br tags create line breaks */
  :global(.milkdown br),
  :global(.ProseMirror br) {
    display: block !important;
    content: "" !important;
    margin: 0 !important;
  }

  /* Reset all ProseMirror default styling */
  :global(.ProseMirror) {
    padding: 0 !important;
    margin: 0 !important;
    outline: none !important;
  }

  :global(.ProseMirror p) {
    margin: 0 !important;
  }

  :global(.ProseMirror-focused) {
    outline: none !important;
  }

  /* Remove any Milkdown container styling */
  :global(.milkdown) {
    all: unset !important;
  }

  :global(.editor) {
    all: unset !important;
  }
</style>
