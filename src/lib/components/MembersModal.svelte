<script lang="ts">
  import { X, Crown, Pencil, Eye, Trash2, Loader2 } from "@lucide/svelte";

  interface Member {
    userId: string;
    role: string;
    addedAt?: string;
  }

  interface Props {
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
    isOwner: boolean;
    onClose: () => void;
    onRemoveMember?: (userId: string) => void;
  }

  import ConfirmationModal from "./ConfirmationModal.svelte";

  // ... (Props definition)

  let { isOpen, noteId, noteTitle, isOwner, onClose, onRemoveMember }: Props =
    $props();

  let members = $state<Member[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let memberToRemoveId = $state<string | null>(null);

  // Load members when modal opens
  $effect(() => {
    if (isOpen && noteId) {
      loadMembers();
    }
  });

  async function loadMembers() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/notes/${noteId}/members`);
      if (res.ok) {
        const data = await res.json();
        members = data.members || [];
      } else {
        throw new Error("Failed to load members");
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  function handleRemove(userId: string) {
    memberToRemoveId = userId;
  }

  async function confirmRemove() {
    if (!memberToRemoveId) return;
    const userId = memberToRemoveId;
    memberToRemoveId = null;

    try {
      const res = await fetch(
        `/api/notes/${noteId}/members?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        members = members.filter((m) => m.userId !== userId);
        onRemoveMember?.(userId);
      } else {
        throw new Error("Failed to remove member");
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to remove";
    }
  }

  function getRoleIcon(role: string) {
    switch (role) {
      case "owner":
        return Crown;
      case "writer":
        return Pencil;
      case "reader":
        return Eye;
      default:
        return Pencil;
    }
  }

  function formatRole(role: string): string {
    switch (role) {
      case "owner":
        return "Owner";
      case "writer":
        return "Can edit";
      case "reader":
        return "View only";
      default:
        return role;
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={onClose}
  >
    <div
      class="w-full max-w-md rounded-lg bg-base-100 shadow-xl"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-base-300 p-4"
      >
        <h2 class="text-lg font-semibold">Members of "{noteTitle}"</h2>
        <button onclick={onClose} class="btn btn-circle btn-ghost btn-sm">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="max-h-80 overflow-y-auto p-4">
        {#if loading}
          <div class="flex items-center justify-center py-8">
            <Loader2 class="h-6 w-6 animate-spin text-primary" />
          </div>
        {:else if error}
          <div class="py-4 text-center text-error">
            {error}
          </div>
        {:else if members.length === 0}
          <div class="py-4 text-center text-base-content/60">
            No members found
          </div>
        {:else}
          <div class="space-y-2">
            {#each members as member (member.userId)}
              {@const RoleIcon = getRoleIcon(member.role)}
              <div
                class="flex items-center justify-between rounded-lg bg-base-200 p-3"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-content"
                  >
                    {member.userId.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div class="font-medium">
                      {member.userId}
                    </div>
                    <div
                      class="flex items-center gap-1 text-xs text-base-content/60"
                    >
                      <RoleIcon class="h-3 w-3" />
                      {formatRole(member.role)}
                    </div>
                  </div>
                </div>

                {#if isOwner && member.role !== "owner"}
                  <button
                    onclick={() => handleRemove(member.userId)}
                    class="btn text-error btn-ghost btn-sm"
                    title="Remove member"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end border-t border-base-300 p-4">
        <button onclick={onClose} class="btn btn-ghost">Close</button>
      </div>
    </div>
  </div>
{/if}

<ConfirmationModal
  isOpen={!!memberToRemoveId}
  title="Remove Member"
  message={`Are you sure you want to remove ${memberToRemoveId} from this note?`}
  type="danger"
  confirmText="Remove"
  onConfirm={confirmRemove}
  onCancel={() => (memberToRemoveId = null)}
/>
