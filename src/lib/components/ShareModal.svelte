<script lang="ts">
  import { X, Users, Lock, Globe, UserPlus } from "@lucide/svelte";

  interface Props {
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
    onClose: () => void;
  }

  let { isOpen, noteId, noteTitle, onClose }: Props = $props();

  type AccessLevel = "private" | "invite_only" | "authenticated" | "open";

  let accessLevel = $state<AccessLevel>("private");
  let invitedUsers = $state<string[]>([]);
  let inviteInput = $state("");

  function addInvitedUser() {
    const trimmed = inviteInput.trim();
    if (trimmed && !invitedUsers.includes(trimmed)) {
      invitedUsers = [...invitedUsers, trimmed];
      inviteInput = "";
    }
  }

  function removeInvitedUser(user: string) {
    invitedUsers = invitedUsers.filter((u) => u !== user);
  }

  async function handleSave() {
    // TODO: Call share API endpoint
    console.log("Saving share settings:", {
      noteId,
      accessLevel,
      invitedUsers,
    });
    onClose();
  }

  function getShareUrl() {
    return `${window.location.origin}/notes/${noteId}`;
  }

  async function copyShareUrl() {
    await navigator.clipboard.writeText(getShareUrl());
    // TODO: Show toast notification
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={onClose}
  >
    <div
      class="w-full max-w-lg rounded-lg bg-base-100 shadow-xl"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-base-300 p-4"
      >
        <div class="flex items-center gap-2">
          <Users class="h-5 w-5" />
          <h2 class="text-lg font-semibold">Share "{noteTitle}"</h2>
        </div>
        <button onclick={onClose} class="btn btn-circle btn-ghost btn-sm">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-4 p-4">
        <!-- Permission Level -->
        <div class="space-y-2">
          <label class="label">
            <span class="label-text font-medium">Permission Level</span>
          </label>

          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200"
          >
            <input
              type="radio"
              name="access"
              value="private"
              bind:group={accessLevel}
              class="radio radio-primary"
            />
            <Lock class="h-4 w-4" />
            <div class="flex-1">
              <div class="font-medium">Private (Only Me)</div>
              <div class="text-sm text-base-content/60">
                Only you can access this note
              </div>
            </div>
          </label>

          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200"
          >
            <input
              type="radio"
              name="access"
              value="invite_only"
              bind:group={accessLevel}
              class="radio radio-primary"
            />
            <UserPlus class="h-4 w-4" />
            <div class="flex-1">
              <div class="font-medium">Private (Invite Only)</div>
              <div class="text-sm text-base-content/60">
                Only invited users can access
              </div>
            </div>
          </label>

          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200"
          >
            <input
              type="radio"
              name="access"
              value="authenticated"
              bind:group={accessLevel}
              class="radio radio-primary"
            />
            <Users class="h-4 w-4" />
            <div class="flex-1">
              <div class="font-medium">Public (Authenticated)</div>
              <div class="text-sm text-base-content/60">
                Anyone with an account can access
              </div>
            </div>
          </label>

          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200"
          >
            <input
              type="radio"
              name="access"
              value="open"
              bind:group={accessLevel}
              class="radio radio-primary"
            />
            <Globe class="h-4 w-4" />
            <div class="flex-1">
              <div class="font-medium">Public (Open Access)</div>
              <div class="text-sm text-base-content/60">
                Anyone with the link can view
              </div>
            </div>
          </label>
        </div>

        <!-- Invite Users (only shown for invite_only) -->
        {#if accessLevel === "invite_only"}
          <div class="space-y-2">
            <label class="label">
              <span class="label-text font-medium">Invite Users</span>
            </label>

            <div class="flex gap-2">
              <input
                type="text"
                bind:value={inviteInput}
                placeholder="@user:server.com"
                class="input-bordered input flex-1"
                onkeydown={(e) => e.key === "Enter" && addInvitedUser()}
              />
              <button onclick={addInvitedUser} class="btn btn-primary">
                Add
              </button>
            </div>

            {#if invitedUsers.length > 0}
              <div class="mt-2 space-y-1">
                {#each invitedUsers as user}
                  <div
                    class="flex items-center justify-between rounded bg-base-200 p-2"
                  >
                    <span class="text-sm">{user}</span>
                    <button
                      onclick={() => removeInvitedUser(user)}
                      class="btn btn-ghost btn-xs"
                    >
                      Remove
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Share Link -->
        {#if accessLevel !== "private"}
          <div class="space-y-2">
            <label class="label">
              <span class="label-text font-medium">Share Link</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                readonly
                value={getShareUrl()}
                class="input-bordered input flex-1 bg-base-200"
              />
              <button onclick={copyShareUrl} class="btn btn-primary">
                📋 Copy
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 border-t border-base-300 p-4">
        <button onclick={onClose} class="btn btn-ghost">Cancel</button>
        <button onclick={handleSave} class="btn btn-primary">Save</button>
      </div>
    </div>
  </div>
{/if}
