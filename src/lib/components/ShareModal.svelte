<script lang="ts">
  import {
    X,
    Users,
    Lock,
    Globe,
    UserPlus,
    Loader2,
    Check,
  } from "@lucide/svelte";

  import { decryptKey, encryptWithPassword } from "$lib/crypto";

  // ...

  interface Props {
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
    noteEncryptedKey?: string | undefined;
    onClose: () => void;
  }

  let { isOpen, noteId, noteTitle, noteEncryptedKey, onClose }: Props =
    $props();

  type AccessLevel =
    | "private"
    | "invite_only"
    | "authenticated"
    | "open"
    | "password_protected";

  let accessLevel = $state<AccessLevel>("private");
  let invitedUsers = $state<string[]>([]);
  let inviteInput = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let copied = $state(false);
  let sharePassword = $state("");

  // Load existing settings when modal opens
  $effect(() => {
    if (isOpen && noteId) {
      loadSettings();
    }
  });

  async function loadSettings() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/notes/${noteId}/share`);
      if (res.ok) {
        const data = await res.json();
        accessLevel = data.accessLevel || "private";
        invitedUsers = data.invitedUsers || [];
      } else if (res.status !== 404) {
        // 404 is fine - just means no settings yet
        const text = await res.text();
        console.error("Failed to load share settings:", text);
      }
    } catch (err) {
      console.error("Error loading share settings:", err);
    } finally {
      loading = false;
    }
  }

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
    saving = true;
    error = null;
    success = false;

    try {
      let passwordEncryptedKey: string | undefined;

      if (accessLevel === "password_protected") {
        if (!sharePassword) {
          throw new Error("Password is required.");
        }

        // 1. Get Owner Key
        const ownerPrivateKey = sessionStorage.getItem("notes_raw_private_key");
        if (!ownerPrivateKey) {
          throw new Error(
            "Vault is locked (Private Key unavailable). Cannot set password protection.",
          );
        }

        if (!noteEncryptedKey) {
          throw new Error(
            "Note Key not found. Cannot set password protection.",
          );
        }

        // 2. Decrypt Note Key
        // Note: If noteEncryptedKey is already "raw" (<=44 chars), we use it directly.
        // Otherwise we decrypt it.
        let rawNoteKey = noteEncryptedKey;
        if (noteEncryptedKey.length > 44) {
          try {
            rawNoteKey = await decryptKey(noteEncryptedKey, ownerPrivateKey);
          } catch (e) {
            console.error("Failed to decrypt note key for re-encryption:", e);
            throw new Error(
              "Failed to decrypt note key. Verify your vault is unlocked.",
            );
          }
        }

        // 3. Encrypt for new Password
        passwordEncryptedKey = await encryptWithPassword(
          rawNoteKey,
          sharePassword,
        );
      }

      const res = await fetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessLevel,
          invitedUsers: accessLevel === "invite_only" ? invitedUsers : [],
          passwordEncryptedKey,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save settings");
      }

      const data = await res.json();

      if (data.failedInvites && data.failedInvites.length > 0) {
        error = `Saved, but failed to invite: ${data.failedInvites.join(", ")}`;
        // Don't close automatically so user sees the error
        success = false;
      } else {
        success = true;
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  function getShareUrl() {
    return `${window.location.origin}/notes/${noteId}`;
  }

  async function copyShareUrl() {
    await navigator.clipboard.writeText(getShareUrl());
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
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

          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200"
          >
            <input
              type="radio"
              name="access"
              value="password_protected"
              bind:group={accessLevel}
              class="radio radio-primary"
            />
            <Lock class="h-4 w-4" />
            <div class="flex-1">
              <div class="font-medium">Password Protected</div>
              <div class="text-sm text-base-content/60">
                Requires a password to access
              </div>
            </div>
          </label>
        </div>

        <!-- Password Input (only shown for password_protected) -->
        {#if accessLevel === "password_protected"}
          <div class="space-y-2 rounded bg-base-200 p-3">
            <label class="label">
              <span class="label-text font-medium">Set Password</span>
            </label>
            <input
              type="password"
              bind:value={sharePassword}
              placeholder="Enter password..."
              class="input-bordered input w-full"
            />
            <p class="text-xs text-base-content/60">
              Note: Because we use End-to-End Encryption, if you lose this
              password, nobody (including the server) can recover the access for
              others.
            </p>
          </div>
        {/if}

        <!-- Invite Users (only shown for invite_only) -->
        {#if accessLevel === "invite_only"}
          <div class="space-y-2">
            <label class="label">
              <span class="label-text font-medium">Invite Users</span>
            </label>

            <div class="flex gap-2">
              <label class="sr-only" for="invite-user-input">User Handle</label>
              <input
                id="invite-user-input"
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
              <label class="sr-only" for="share-url">Share Link URL</label>
              <input
                id="share-url"
                type="text"
                readonly
                value={getShareUrl()}
                class="input-bordered input flex-1 bg-base-200"
              />
              <button
                onclick={copyShareUrl}
                class="btn btn-primary"
                disabled={copied}
                aria-label="Copy share link"
              >
                {#if copied}
                  <Check class="h-4 w-4" /> Copied!
                {:else}
                  📋 Copy
                {/if}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Error message -->
      {#if error}
        <div
          class="border-t border-base-300 bg-error/10 px-4 py-2 text-sm text-error"
        >
          {error}
        </div>
      {/if}

      <!-- Footer -->
      <div class="flex justify-end gap-2 border-t border-base-300 p-4">
        <button onclick={onClose} class="btn btn-ghost" disabled={saving}>
          Cancel
        </button>
        <button
          onclick={handleSave}
          class="btn btn-primary"
          disabled={saving || loading}
        >
          {#if saving}
            <Loader2 class="h-4 w-4 animate-spin" />
            Saving...
          {:else if success}
            <Check class="h-4 w-4" />
            Saved!
          {:else}
            Save
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
