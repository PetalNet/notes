# Dear LLM Agents

This document provides comprehensive guidance on working effectively with this codebase.

## Planning First

> [!IMPORTANT]
> ALWAYS plan your work before implementing:
>
> - Break down complex tasks into smaller, manageable steps
> - Use the `manage_todo_list` tool to track progress
> - Identify which files need to be modified
> - Consider dependencies between changes
> - Think through edge cases before coding

## Do's and Don'ts

### ✅ DO

- **Read existing code first** - Use `read_file` to understand current implementations before making changes
- **Make small, incremental changes** - Prefer small diffs that are easy to review
- **Test your changes** - Verify the code works after modifications
- **Use the Svelte MCP tools** - Always use `svelte-autofixer` before finalizing Svelte components
- **Follow project conventions** - Match existing code style and patterns
- **Use DaisyUI component classes** - Stick to semantic DaisyUI classes (e.g., `btn`, `card`, `badge`)
- **Validate with ESLint** - Use the ESLint MCP server to check your code
- **Check the schema** - Review `src/lib/server/db/schema.ts` for database structure
- **Plan with todos** - Use `manage_todo_list` for multi-step work
- **Mark tasks complete immediately** - Update task status as soon as each step is done

### ❌ DON'T

- **Don't use raw Tailwind colors** - Avoid `bg-blue-500`, `text-red-600`, etc. Use DaisyUI classes instead (e.g., `btn-primary`, `badge-error`)
- **Don't make large sweeping changes** - Break them into smaller iterations
- **Don't skip the svelte-autofixer** - Always validate Svelte components before finalizing
- **Don't ignore TypeScript errors** - Address type issues properly
- **Don't create unnecessary files** - Only create files essential to the request
- **Don't use emojis** - Unless explicitly requested by the user
- **Don't mix style approaches** - Stick to DaisyUI, don't add custom Tailwind utilities
- **Don't assume** - Read the actual code rather than guessing implementation details
- **Don't batch completions** - Mark each todo as completed immediately after finishing it

## When an Iteration is Complete

An iteration is done when:

1. ✅ All code changes are implemented
2. ✅ The diff is small and focused (prefer multiple small PRs over one large one)
3. ✅ Svelte components have been validated with `svelte-autofixer`
4. ✅ ESLint shows no errors (use `mcp_eslint_lint-files`)
5. ✅ TypeScript types are correct
6. ✅ The code follows DaisyUI conventions (no raw Tailwind colors)
7. ✅ All todos are marked complete
8. ✅ Changes are tested or testable

> [!TIP]
> Always aim for small, reviewable diffs - it's better to make 3 small changes than 1 large one.

## Git Hygiene

### ❌ Never Commit

- **Generated code** - Build outputs, compiled files, bundled assets
- **Dependencies** - `node_modules/`, `.pnpm-store/`, package manager caches
- **Secrets and tokens** - API keys, passwords, authentication tokens, private keys
- **Environment files with secrets** - `.env.local`, `.env.production` with sensitive data
- **Personal IDE settings** - User-specific VS Code settings, workspace files
- **OS files** - `.DS_Store`, `Thumbs.db`, temporary files
- **Database files** - `*.db`, `*.sqlite` (unless explicitly part of the project)
- **Log files** - Application logs, debug outputs

### ✅ Safe to Commit

- **Source code** - Application code, configuration files
- **Public environment templates** - `.env.example` with placeholder values
- **Documentation** - README, guides, API docs
- **Tests** - Unit tests, integration tests, test fixtures
- **Configuration** - Build configs, linter configs, project settings
- **Migration files** - Database schema migrations (after review)

### Commit Workflow

> [!WARNING]
> You may offer to commit changes, but DO NOT commit unless explicitly asked by the user.

When offering to commit:

1. Show what files will be staged
2. Suggest an appropriate commit message
3. Wait for user confirmation before proceeding

```bash
# Review changes before committing
git status
git diff

# Stage specific files (never use git add .)
git add src/path/to/file.ts

# Commit with descriptive message
git commit -m "feat: add user profile component"
```

### Best Practices

- **Review diffs before staging** - Always check what's being committed
- **Stage files explicitly** - Avoid `git add .` or `git add -A`
- **Write clear commit messages** - Follow conventional commits format when possible
- **Keep commits focused** - One logical change per commit
- **Check .gitignore** - Ensure sensitive files are ignored before creating them

## Available MCP Servers

This workspace has access to several MCP servers that provide powerful capabilities:

### 1. Svelte MCP Server (`mcp_svelte_*`)

Official Svelte/SvelteKit documentation and tooling:

#### `list-sections`

> [!IMPORTANT]
> Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
> When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

#### `get-documentation`

> [!IMPORTANT]
> Retrieves full documentation content for specific sections. Accepts single or multiple sections.
> After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

#### `svelte-autofixer`

> [!IMPORTANT]
> Analyzes Svelte code and returns issues and suggestions.
> You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

#### `playground-link`

> [!NOTE]
> Generates a Svelte Playground link with the provided code.
> After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

### 2. Context7 MCP Server (`mcp_context7_*`)

Up-to-date documentation for external libraries:

#### `resolve-library-id`

Resolves a package name to a Context7-compatible library ID. MUST be called before `get-library-docs` unless the user provides an explicit ID.

#### `get-library-docs`

Fetches comprehensive, current documentation for any library. Use this when you need to understand how to use external dependencies.

> [!IMPORTANT]
> When to use (automatically, without being asked):
>
> - Code generation involving external libraries
> - Setup or configuration steps for dependencies
> - Understanding library/API usage and patterns
> - Implementing features with third-party packages

**Example workflow:**

1. Call `resolve-library-id` with `libraryName: "drizzle-orm"`
2. Use returned ID with `get-library-docs` to fetch documentation
3. Implement features using official, up-to-date patterns

> [!IMPORTANT]
> Always use Context7 proactively when working with external libraries - you don't need to wait for explicit requests.

> [!NOTE]
> For Svelte/SvelteKit documentation, prefer using the Svelte MCP Server instead, as it provides more comprehensive and specialized Svelte-specific documentation.

### 3. ESLint MCP Server (`mcp_eslint_*`)

Code quality and linting:

#### `lint-files`

Lints specified files and returns errors/warnings. Use this to validate your code changes before finalizing.

**Usage:** `mcp_eslint_lint-files` with an array of absolute file paths.

### 4. Serena MCP Server (`mcp_oraios_serena_*`)

Intelligent code navigation and symbolic editing:

#### Code Exploration

- `get_symbols_overview` - Get high-level view of symbols in a file (use this FIRST)
- `find_symbol` - Find and read specific symbols by name path
- `find_referencing_symbols` - Find where symbols are used
- `search_for_pattern` - Flexible regex-based code search

#### Code Editing

- `replace_symbol_body` - Replace entire symbol body (methods, classes, etc.)
- `insert_after_symbol` - Insert code after a symbol
- `insert_before_symbol` - Insert code before a symbol
- `rename_symbol` - Rename symbols throughout codebase

#### Memory Management

- `write_memory` - Save project information for future reference
- `read_memory` - Retrieve saved project context
- `edit_memory` - Update existing memories
- `delete_memory` - Remove outdated memories

#### Project Management

- `activate_project` - Switch between registered projects
- `get_current_config` - View current configuration

> [!TIP]
> Use symbolic tools to read only necessary code. Start with `get_symbols_overview` before reading full files.

### 5. Socket MCP Server (`mcp__extension_so_depscore`)

Dependency security and quality scoring:

#### `depscore`

Scans dependencies for quality and security scores using Socket's analysis.

> [!NOTE]
> **Usage:** Provide package names with ecosystem (npm, pypi, etc.) and versions.

> [!IMPORTANT]
> **When to use:**
>
> - **Always** when adding a new dependency - Check scores before installing
> - When scanning existing dependencies in generated code
> - Check both manifest files (package.json, pyproject.toml) **AND** imports in code

**Workflow:**

1. Before adding a new dependency, run `depscore` to check its security and quality scores
2. If the score is low, consider using an alternative library
3. If you decide to use a library with a low score, document the reasons for your choice
4. When checking dependencies, scan both:
   - Manifest files (package.json, pyproject.toml, etc.)
   - Import statements in the actual code files

> [!WARNING]
> Stop and ask user how to proceed if any dependency scores are low.

## Project Structure

This is a **SvelteKit + Drizzle ORM + Lucia Auth** notes application with real-time collaboration features.

### Key Directories

```text
src/
├── lib/
│   ├── assets/             # Static assets (images, icons)
│   ├── components/         # Svelte components
│   │   └── codemirror/     # CodeMirror editor components
│   ├── editor/             # Editor utilities (wikilinks)
│   ├── remote/             # Remote data fetching
│   ├── server/             # Server-only code
│   │   ├── auth.ts         # Lucia authentication setup
│   │   ├── real-time.ts    # Real-time collaboration
│   │   └── db/
│   │       ├── index.ts    # Database connection
│   │       └── schema.ts   # Drizzle schema definitions
│   ├── crypto.ts           # Cryptography utilities
│   ├── loro.ts             # Loro CRDT for collaboration
│   └── schema.ts           # Shared Effect Schema definitions
├── routes/
│   ├── (auth)/             # Auth routes (login, signup)
│   ├── (editor)/           # Editor routes
│   ├── api/                # API endpoints
│   │   ├── auth/           # Auth endpoints
│   │   ├── notes/          # Notes CRUD
│   │   └── sync/           # Real-time sync endpoints
│   ├── notes/[id]/         # Individual note pages
│   └── +page.svelte        # Home page
├── app.html                # HTML template
├── app.d.ts                # TypeScript definitions
└── hooks.server.ts         # Server hooks
```

### Important Files

#### Database Schema (`src/lib/server/db/schema.ts`)

Drizzle ORM schema definitions for:

- `users` - User accounts
- `sessions` - Lucia auth sessions
- `notes` - Note documents
- Other entities

Always check this file to understand the data model before making database-related changes.

#### Authentication (`src/lib/server/auth.ts`)

Lucia authentication configuration. Review this when working on auth-related features.

#### Real-time (`src/lib/server/real-time.ts`)

Handles real-time collaboration using Loro CRDT. Check this for sync-related work.

#### Editor Components (`src/lib/components/codemirror/`)

CodeMirror integration for the note editor:

- `Editor.svelte` - Main editor component
- `Codemirror.svelte` - CodeMirror wrapper
- `Toolbar.svelte` - Editor toolbar
- `Editor.ts` - Editor utilities

### Technology Stack

- **Framework:** SvelteKit (Svelte 5 with runes)
- **Database:** SQLite + Drizzle ORM
- **Auth:** Lucia v3
- **UI:** DaisyUI (Tailwind-based component library)
- **Editor:** CodeMirror 6
- **Real-time:** Loro CRDT
- **Package Manager:** pnpm

## File-Scoped Commands

### Type Checking

```bash
# Type check the entire project
# Unfortunately, there’s no way to limit to specific files, but use as needed anyway.
pnpm check
```

### Linting

Use the ESLint MCP server instead of directly use the CLI.

### Formatting

```bash
# Format a single file by path
pnpm prettier --write path/to/file.ts
```

### Database Migrations

```bash
# Generate migration after schema changes
pnpm drizzle-kit generate

# Apply migrations to database
pnpm drizzle-kit migrate

# Locally push changes without generating migration files, use with caution
pnpm drizzle-kit push
```

### Development Server

Do not start the dev server unless explicitly requested.

### Building

```bash
# Full build (use sparingly, only when explicitly requested)
pnpm build

# Preview production build (do not start server unless explicitly requested)
pnpm preview
```

> [!TIP]
> Always typecheck, lint, and format updated files. Use project-wide build sparingly.

## DaisyUI Styling Guidelines

This project uses **DaisyUI**, which provides semantic component classes. Never use raw Tailwind color utilities.

### ✅ Correct (DaisyUI)

```svelte
<button class="btn btn-primary">Save</button>
<div class="card bg-base-200">...</div>
<span class="badge badge-error">Error</span>
<div class="alert alert-success">Success!</div>
```

### ❌ Incorrect (Raw Tailwind)

```svelte
<button class="bg-blue-500 text-white">Save</button>
<div class="bg-gray-800">...</div>
<span class="bg-red-600 text-white">Error</span>
<div class="bg-green-100 text-green-800">Success!</div>
```

### Common DaisyUI Classes

- **Buttons:** `btn`, `btn-primary`, `btn-secondary`, `btn-accent`, `btn-ghost`, `btn-link`
- **Cards:** `card`, `card-body`, `card-title`, `card-actions`
- **Alerts:** `alert`, `alert-info`, `alert-success`, `alert-warning`, `alert-error`
- **Badges:** `badge`, `badge-primary`, `badge-secondary`, `badge-accent`
- **Forms:** `input`, `textarea`, `select`, `checkbox`, `radio`, `toggle`
- **Layout:** `drawer`, `navbar`, `menu`, `footer`, `divider`
- **Colors:** `bg-base-100`, `bg-base-200`, `bg-base-300`, `text-base-content`

Refer to [DaisyUI documentation](https://daisyui.com/components/) for more components.

## Svelte 5 & SvelteKit Patterns

### Component Script Ordering

Follow this ordering convention in `<script>` tags:

1. **Imports**
2. **Props** (`$props()`)
3. **Function Calls / Promises** (e.g. initiating remote queries)
4. **Effects & State** (`$effect`, `$state`, etc.)
5. **Derived Async Data** (`$derived(await query)`)

### Context Management (`createContext`)

Use the new `createContext` function from `svelte` for type-safe context management. This replaces the manual `Symbol` key pattern and provides a cleaner API.

```typescript
import { createContext } from "svelte";

// Define the context with a type - returns a getter and setter pair
export const [getLinkContext, setLinkContext] = createContext<LinkContext>();

// In parent component
setLinkContext({ ... });

// In child component
const ctx = getLinkContext();
```

### Remote Functions

When using SvelteKit remote functions, always wrap the call in `$derived` when using it in a component, especially if it depends on reactive props or state. This ensures the promise is re-evaluated when dependencies change.

```svelte
<script>
  import { getNote } from "$lib/remote/notes.remote";

  let { noteId } = $props();

  let noteQuery = $derived(getNote(noteId));

  // ✅ Correct: Reactive to noteId changes
  let note = $derived(await noteQuery);
</script>
```

### Shared State & SSR

> [!WARNING]
> **NEVER** use global shared stores (e.g., exported `writable` stores or `$state` in module scope) for user-specific data.

In SvelteKit SSR, module-level state is shared across **all** requests. This means one user could see another user's data if you store it in a global variable or exported store.

**Instead:**

- Use `createContext` to scope state to the component tree (which is request-scoped during SSR).
- Pass data via `props`.
- Use `page.data` for route-specific data.

### Optimistic UI

Svelte 5 and SvelteKit provide several ways to implement optimistic UI, where you update the interface immediately while waiting for a server response.

#### 1. Writable `$derived` (Local Overrides)

Since Svelte 5.25, you can reassign `$derived` values to temporarily override them. This is perfect for optimistic updates where a value is derived from server data but you want to show immediate feedback.

```svelte
<script>
  let { post, like } = $props();

  // Derived from props (server data)
  let likes = $derived(post.likes);

  async function onclick() {
    // Optimistically update the derived value
    likes += 1;

    try {
      // Call the server action
      await like();
    } catch {
      // Rollback on failure
      likes -= 1;
    }
  }
</script>

<button {onclick}>🧡 {likes}</button>
```

#### 2. Remote Functions with `updates` and `withOverride`

When using SvelteKit remote functions, you can use `.updates()` with `.withOverride()` to optimistically update the cache of a query.

```typescript
import { getPosts, createPost } from '$lib/remote/posts.remote';

async function handleSubmit() {
  const newPost = { id: 'temp', title: 'New Post' };

  // Optimistically update the getPosts query cache
  await createPost(newPost).updates(
    getPosts().withOverride((posts) => [newPost, ...posts])
  );
}
```

#### 3. `$state.eager`

Use `$state.eager` when you need to update the UI immediately in response to a state change, bypassing Svelte's default synchronized updates (which might wait for async work).

```svelte
<nav>
  <!-- Update active class immediately on click, before navigation completes -->
  <a
    href="/about"
    aria-current={$state.eager(page.url.pathname) === "/about" ? "page" : null}
  >
    About
  </a>
</nav>
```

### Legacy Patterns to Avoid

> [!IMPORTANT]
> The following patterns are considered **legacy** in this codebase and should be avoided in favor of modern Svelte 5 and SvelteKit features.

#### ❌ Load Functions (`load`)

Avoid using `load` functions in `+page.ts` or `+page.server.ts` for data fetching.
**Instead:** Use **Remote Functions** (`.remote.ts`) imported directly into your components.

#### ❌ `{#await}` Blocks

Avoid using `{#await}` blocks in templates.
**Instead:** Use top-level `await` in your component's `<script>` tag (supported in Svelte 5). This allows the component to suspend execution until the promise resolves, simplifying the template.

```svelte
<script>
  import { getNote } from "$lib/remote/notes.remote";
  let { noteId } = $props();

  // Component suspends here until data is ready
  let note = $derived(await getNote(noteId));
</script>

<!-- No need for {#await} --><h1>{note.title}</h1>
```

Be aware that `<svelte:boundary>` exists for handling errors and pending states in async components. It is particularly useful for wrapping components that use top-level `await` when you want to provide a fallback UI or error handling.

## Workflow Example

Here's an ideal workflow for adding a new feature:

1. **Plan** - Use `manage_todo_list` to break down the task
2. **Research** - Read relevant files to understand current implementation
3. **Consult docs** - Use MCP servers (Svelte, Context7) for documentation
4. **Implement** - Make small, focused changes
5. **Validate** - Use `svelte-autofixer` and `mcp_eslint_lint-files`
6. **Test** - Verify the changes work
7. **Complete** - Mark todos as done immediately after each step

> [!TIP]
> Remember: Small diffs, frequent iterations, immediate completion tracking.
