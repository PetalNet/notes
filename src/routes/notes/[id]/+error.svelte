<script lang="ts">
  import { page } from "$app/state";
  import { FilePlus } from "@lucide/svelte";
  import { isHttpError } from "@sveltejs/kit";

  interface Props {
    error: unknown;
  }

  const props: Props = $props();
  const error = $derived(page.error ?? props.error);
</script>

{#if isHttpError(error, 404)}
  <div class="flex h-full w-full items-center justify-center text-base-content">
    <div class="text-center">
      <div
        class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-content/25"
      >
        <FilePlus />
      </div>
      <p class="mb-2 text-xl font-medium">No note selected</p>
      <p class="text-sm">Select a note from the sidebar or create a new one.</p>
    </div>
  </div>
{/if}
