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
  import remarkBreaks from "remark-breaks";
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

  let {
    content,
    onchange,
  }: { content: string; onchange: (newContent: string) => void } = $props();

  let editorElement: HTMLElement;
  let editor: Editor | undefined;
  let isInternalUpdate = false;

  onMount(async () => {
    editor = await Editor.make()
      .use((ctx) => {
        ctx.set(rootCtx, editorElement);
        ctx.set(defaultValueCtx, content);
        return () => {};
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use((ctx) => {
        // Listener for content changes
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            isInternalUpdate = true;
            onchange(markdown);
            isInternalUpdate = false;
          }
        });
        return () => {};
      })
      .use((ctx) => {
        ctx.update(remarkPluginsCtx, (prev) => [
          ...(prev as any[]),
          remarkBreaks,
        ]);
        return () => {};
      })
      .create();
  });

  function runCommand(command: any, payload?: any) {
    if (editor) {
      editor.action(callCommand(command, payload));
    }
  }

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  // Handle external content updates
  // Handle external content updates
  $effect(() => {
    if (editor && !isInternalUpdate) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as any; // Cast to any to avoid prosemirror types dependency
        const { state } = view;

        // Only update if content is different
        // We skip serialization check for now to simplify, assuming !isInternalUpdate is enough
        // and trusting that +page.svelte handles the loop prevention via onchange logic.

        const parser = ctx.get(parserCtx);
        const tr = state.tr.replaceWith(
          0,
          state.doc.content.size,
          parser(content),
        );
        view.dispatch(tr);
      });
    }
  });
</script>

<div class="flex h-full flex-col bg-white">
  <!-- Formatting Toolbar -->
  <div class="border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
    <div class="flex items-center gap-1">
      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => runCommand(toggleStrongCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bold (Cmd+B)"
        >
          <Bold size={18} />
        </button>
        <button
          onclick={() => runCommand(toggleEmphasisCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Italic (Cmd+I)"
        >
          <Italic size={18} />
        </button>
        <button
          onclick={() => runCommand(toggleStrikethroughCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Strikethrough (Cmd+Shift+X)"
        >
          <Strikethrough size={18} />
        </button>
        <button
          onclick={() => runCommand(toggleInlineCodeCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Code (Cmd+E)"
        >
          <Code size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => runCommand(toggleLinkCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Link (Cmd+K)"
        >
          <Link size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => runCommand(wrapInHeadingCommand.key, 1)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          onclick={() => runCommand(wrapInHeadingCommand.key, 2)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          onclick={() => runCommand(wrapInHeadingCommand.key, 3)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>
      </div>

      <div class="mx-2 h-6 w-px bg-gray-200"></div>

      <div class="flex items-center gap-0.5 rounded-lg bg-gray-100 p-1">
        <button
          onclick={() => runCommand(wrapInBulletListCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          onclick={() => runCommand(wrapInOrderedListCommand.key)}
          class="rounded p-1.5 text-gray-600 transition-all hover:bg-white hover:text-gray-900 hover:shadow-sm"
          title="Numbered List"
        >
          <ListOrdered size={18} />
        </button>
      </div>
    </div>
  </div>
  <div
    bind:this={editorElement}
    class="milkdown-container prose max-w-none flex-1 cursor-text overflow-y-auto"
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
  /* Match Prosemark styling */
  :global(.milkdown-container .milkdown) {
    font-family: "Inter", sans-serif;
    background-color: #ffffff;
    color: var(--color-slate-900);
    min-height: 100%;
    max-width: 65ch;
    margin: 0 auto;
    padding: 16px 16px 16px 24px; /* 16px + 8px gutter compensation */
    font-size: 16px;
    line-height: 1.5;
  }

  :global(.milkdown-container .milkdown .editor) {
    outline: none;
    white-space: pre-wrap;
    height: 100%;
  }

  /* Remove top margin from the first element to prevent "running low" */
  :global(.milkdown-container .prose > :first-child) {
    margin-top: 0 !important;
  }

  /* Override prose defaults to match Prosemark exactly */
  :global(.milkdown-container .prose) {
    color: var(--color-slate-900) !important;
    max-width: 65ch;
  }

  :global(.milkdown-container .prose h1),
  :global(.milkdown-container .prose h2),
  :global(.milkdown-container .prose h3),
  :global(.milkdown-container .prose h4),
  :global(.milkdown-container .prose h5),
  :global(.milkdown-container .prose h6),
  :global(.milkdown-container .prose strong),
  :global(.milkdown-container .prose b),
  :global(.milkdown-container .prose code),
  :global(.milkdown-container .prose p) {
    color: var(--color-slate-900) !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }

  :global(.milkdown-container .prose ul),
  :global(.milkdown-container .prose ol),
  :global(.milkdown-container .prose li),
  :global(.milkdown-container .prose blockquote) {
    color: var(--color-slate-900) !important;
  }

  :global(.milkdown-container .prose a) {
    color: #2563eb !important; /* Blue-600 */
    text-decoration: none;
  }

  :global(.milkdown-container .prose a:hover) {
    text-decoration: underline;
  }
</style>
