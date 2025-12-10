<script lang="ts">
  import { AlertTriangle, Info } from "@lucide/svelte";

  interface Props {
    isOpen: boolean;
    title: string;
    message: string;
    type?: "danger" | "info" | "warning";
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel: () => void;
    isAlert?: boolean; // If true, only shows Confirm (OK) button
  }

  let {
    isOpen,
    title,
    message,
    type = "info",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isAlert = false,
  }: Props = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 focus:outline-none"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={(e) => {
      if (e.key === "Escape") onCancel();
    }}
  >
    <div
      class="w-full max-w-sm overflow-hidden rounded-lg bg-base-100 shadow-xl"
    >
      <div class="flex items-start gap-4 p-6">
        {#if type === "danger"}
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error/10 text-error"
          >
            <AlertTriangle class="h-5 w-5" />
          </div>
        {:else if type === "warning"}
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning"
          >
            <AlertTriangle class="h-5 w-5" />
          </div>
        {:else}
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-info"
          >
            <Info class="h-5 w-5" />
          </div>
        {/if}

        <div class="flex-1">
          <h3 class="text-lg font-semibold text-base-content">{title}</h3>
          <p class="mt-2 text-sm text-base-content/70">
            {message}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-3 bg-base-200/50 px-6 py-4">
        {#if !isAlert}
          <button class="btn btn-ghost btn-sm" onclick={onCancel}>
            {cancelText}
          </button>
        {/if}

        <button
          class="btn btn-sm"
          class:btn-error={type === "danger"}
          class:btn-primary={type !== "danger"}
          onclick={() => {
            if (onConfirm) onConfirm();
            else onCancel(); // For alerts, often just closes
          }}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
