<script lang="ts">
  import { resolve } from "$app/paths";
  import { getSidebarContext } from "$lib/components/sidebar-context.js";
  import { formatRelativeTime } from "$lib/utils/time.js";
  import { PanelLeftOpen } from "@lucide/svelte";
  import { Temporal } from "temporal-polyfill";

  let { data } = $props();
  const sidebar = getSidebarContext();
</script>

<div class="h-full bg-base-100 p-8">
  <div class="mx-auto max-w-6xl">
    <h1 class="mb-8 text-4xl font-bold">Dashboard</h1>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <!-- Total Notes Card -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl">Total Notes</h2>
          <div class="flex items-center justify-center py-8">
            <span class="text-6xl font-bold text-primary">
              {data.totalNotes}
            </span>
          </div>
        </div>
      </div>

      <!-- Random Note Card -->
      {#if data.randomNote}
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title text-2xl">Random Note</h2>
            <div class="py-4">
              <h3 class="mb-2 text-xl font-semibold">
                {data.randomNote.title}
              </h3>
              <p class="text-sm text-base-content/60">
                Last updated: {formatRelativeTime(
                  Temporal.Instant.fromEpochMilliseconds(
                    data.randomNote.updatedAt.getTime(),
                  ),
                )}
              </p>
            </div>
            <div class="card-actions justify-end">
              <a
                href={resolve("/notes/[id]", { id: data.randomNote.id })}
                class="btn btn-secondary"
              >
                Open Note
              </a>
            </div>
          </div>
        </div>
      {:else if data.totalNotes === 0}
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title text-2xl">Get Started</h2>
            <div class="py-4">
              <p class="text-base-content/80">
                You don't have any notes yet. Create your first note to get
                started!
              </p>
            </div>
            <div class="card-actions justify-end">
              {#if sidebar.isCollapsed}
                <button
                  class="btn btn-sm btn-primary"
                  onclick={sidebar.toggleSidebar}
                >
                  <PanelLeftOpen size={16} />
                  Open Sidebar
                </button>
              {:else}
                <p class="text-sm text-base-content/60">
                  Use the sidebar to create your first note
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
