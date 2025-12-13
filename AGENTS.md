# Agent Guidelines

## Planning & Workflow

> [!IMPORTANT]
> **ALWAYS plan before implementing.**
>
> 1. Break down tasks into small steps.
> 2. Use `manage_todo_list`.
> 3. Identify files and dependencies.

### Do's

- **Read code first** (`read_file`).
- **Make small, incremental changes**.
- **Test your changes**.
- **Use Svelte MCP** (`svelte-autofixer` is mandatory).
- **Follow DaisyUI** (semantic classes like `btn-primary`).
- **Validate with ESLint**.
- **Check DB schema** (`src/lib/server/db/schema.ts`).
- **Use Drizzle ORM syntax** (always prefer `db.select()` over `db.query` or raw `sql` templates).
- **Mark todos complete** immediately.

### Don'ts

- **No raw Tailwind colors**.
- **No large sweeping changes**.
- **Don't skip `svelte-autofixer`**.
- **Don't ignore TS/ESLint errors**.
- **No emojis**.

### Definition of Done

- Code implemented & tested.
- Diff is small and focused.
- `svelte-autofixer` passed.
- ESLint passed.
- Types correct.
- DaisyUI conventions followed.
- Todos completed.

## Git Hygiene

- **Never Commit**: Generated code, dependencies, secrets, IDE settings, OS files, logs.
- **Safe to Commit**: Source, config, docs, tests, migrations.
- **Workflow**: Review diff -> Stage specific files -> Commit with conventional commit message.

## MCP Servers

### 1. Svelte (`mcp_svelte_*`)

- `list-sections`: **First step** to find docs.
- `get-documentation`: Fetch relevant sections.
- `svelte-autofixer`: **Mandatory** before finalizing components.
- `playground-link`: Offer only after user confirmation.

### 2. Context7 (`mcp_context7_*`)

- `resolve-library-id` -> `get-library-docs`: For external library docs.
- Use proactively for new dependencies.

### 3. ESLint (`mcp_eslint_*`)

- `lint-files`: Validate changes.

### 4. Socket (`mcp__extension_so_depscore`)

- `depscore`: Check new dependencies.

## Project Structure

**Stack**: SvelteKit (Svelte 5), SQLite + Drizzle, Lucia Auth, DaisyUI, CodeMirror 6, Loro CRDT.

### Key Directories

```text
src/
├── lib/
│   ├── assets/             # Static assets
│   ├── components/         # Svelte components
│   ├── editor/             # Editor utilities
│   ├── remote/             # Remote data fetching
│   ├── server/             # Server-only code (Auth, DB, Real-time)
│   ├── types/              # TypeScript types
│   ├── utils/              # Shared utilities
│   ├── crypto.ts           # Crypto utils
│   ├── loro.svelte.ts             # Loro CRDT
│   ├── schema.ts           # Shared Effect Schema
│   └── unawaited.ts        # Unawaited promise handler
├── routes/
│   ├── (auth)/             # Login/Signup
│   ├── api/                # API endpoints
│   ├── notes/              # Note pages
│   ├── +layout.svelte      # Root layout
│   ├── +page.svelte        # Home page
│   └── layout.css          # Global styles
└── hooks.server.ts         # Server hooks
```

### Important Files

- `src/lib/server/db/schema.ts`: DB Schema (Users, Sessions, Notes).
- `src/lib/server/auth.ts`: Lucia-inspired Auth config.
- `src/lib/server/real-time.ts`: Loro CRDT sync.
- `src/lib/components/codemirror/`: Editor components.

## Commands

- **Type Check**: `pnpm check`
- **Format**: `pnpm prettier --write path/to/file.ts`
- **Migrations**: `pnpm drizzle-kit generate` -> `pnpm drizzle-kit migrate`
- **Lint**: Use ESLint MCP.

## DaisyUI Styling

Use semantic classes. Avoid raw Tailwind colors.

### Correct

```svelte
<button class="btn btn-primary">Save</button>
<div class="card bg-base-200">...</div>
<span class="badge badge-error">Error</span>
```

### Incorrect

```svelte
<button class="bg-blue-500 text-white">Save</button>
<div class="bg-gray-800">...</div>
```

## Svelte 5 Patterns

### Script Order

1. Imports
2. Props (`$props()`)
3. Functions/Promises
4. Effects/State (`$effect`, `$state`)
5. Derived Async (`$derived(await query)`)

### Context

Use `createContext` from `svelte`.

```typescript
import { createContext } from "svelte";
export const [getLinkContext, setLinkContext] = createContext<LinkContext>();
```

### Remote Functions

Wrap in `$derived` for reactivity.

```svelte
<script lang="ts">
  import { getNote } from "$lib/remote/notes.remote";
  let { noteId } = $props();
  let noteQuery = $derived(getNote(noteId));
  let note = $derived(await noteQuery);
</script>
```

#### Optimistic Updates

Use `.updates()` with `.withOverride()`.

```typescript
import { getPosts, createPost } from "$lib/remote/posts.remote";

async function handleSubmit() {
  const newPost = { id: "temp", title: "New Post" };
  await createPost(newPost).updates(
    getPosts().withOverride((posts) => [newPost, ...posts]),
  );
}
```

### Shared State & SSR

> [!WARNING]
> **NEVER** use global shared stores (exported `writable` or `$state` in module scope).

In SSR, module state is shared across requests.
**Instead:**

- Use `createContext` for component-scoped state.
- Pass data via `props`.

### Optimistic UI

Use `$derived` overrides or `$state.eager`.

```svelte
<script lang="ts">
  let { post, like } = $props();
  let likes = $derived(post.likes);
  async function onclick() {
    likes += 1; // Optimistic update
    try {
      await like();
    } catch {
      likes -= 1;
    }
  }
</script>
```

### Legacy Patterns (Avoid)

- **No `load` functions**: Use Remote Functions.
- **No `{#await}`**: Use top-level `await` or `<svelte:boundary>`s in `<script>`.
- **No Stores**: Avoid `writable`, `readable`, `derived` stores. Use Runes (`$state`, `$derived`) instead.
