<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import favicon from "$lib/assets/favicon.svg";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { setSidebarContext } from "$lib/components/sidebar-context.ts";
  import {
    decryptWithPassword,
    encryptWithPassword,
    generateSigningKeyPair,
    generateEncryptionKeyPair,
  } from "$lib/crypto.ts";
  import { setupEncryption } from "$lib/remote/accounts.remote.ts";
  import { getNotes } from "$lib/remote/notes.remote.ts";
  import { PersistedState } from "runed";
  import { onMount } from "svelte";

  let { children, data } = $props();

  // User's explicit preference (persisted to localStorage)
  const collapsedDesktop = new PersistedState("sidebarCollapsed", false);
  // Mobile state (always starts collapsed)
  let collapsedMobile = $state(true);

  // Track window width
  let innerWidth = $state(0);
  let isDesktop = $derived(innerWidth >= 768);

  // Derived visual state
  let isCollapsed = $derived(
    isDesktop ? collapsedDesktop.current : collapsedMobile,
  );

  // Handle transitions between breakpoints
  let wasDesktop = $state(true);

  $effect(() => {
    if (innerWidth === 0) return;

    // Desktop -> Mobile: Always collapse
    if (wasDesktop && !isDesktop) {
      collapsedMobile = true;
    }

    // Mobile -> Desktop: If mobile was open, keep open
    if (!wasDesktop && isDesktop) {
      if (!collapsedMobile) {
        collapsedDesktop.current = false;
      }
    }

    wasDesktop = isDesktop;
  });

  function toggleSidebar() {
    if (isDesktop) {
      collapsedDesktop.current = !collapsedDesktop.current;
    } else {
      collapsedMobile = !collapsedMobile;
    }
  }

  // Keyboard shortcut: Ctrl+\ (or Cmd+\ on Mac)
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
      e.preventDefault();
      toggleSidebar();
    }
  }

  setSidebarContext({
    get isCollapsed() {
      return isCollapsed;
    },
    toggleSidebar,
  });

  // Vault State
  let isVaultUnlocked = $state(false);
  let unlockPassword = $state("");
  let unlockError = $state("");

  // Setup Encryption State
  let isSetupRequired = $derived(!!data.user && !data.user.privateKeyEncrypted);
  let setupPassword = $state("");
  let setupError = $state("");
  let setupLoading = $state(false);

  async function handleSetupEncryption() {
    if (!data.user || !setupPassword) return;
    setupLoading = true;
    setupError = "";

    try {
      // 1. Generate Keys
      const signKeys = await generateSigningKeyPair();
      const encKeys = await generateEncryptionKeyPair();

      // 2. Encrypt
      const privateKeyEncrypted = await encryptWithPassword(
        encKeys.privateKey,
        setupPassword,
      );

      // 3. Submit
      await setupEncryption({
        _password: setupPassword,
        publicKey: signKeys.publicKey,
        privateKeyEncrypted,
      });

      // 4. Auto-unlock locally
      sessionStorage.setItem("notes_raw_private_key", encKeys.privateKey);
      isVaultUnlocked = true;

      // Reload to ensure state is fresh
      window.location.reload();
    } catch (e) {
      console.error(e);
      setupError = "Failed to setup encryption. Verify your password.";
    } finally {
      setupLoading = false;
    }
  }

  // Global Private Key State (exposed via Context?)
  // For now, we rely on sessionStorage "notes_raw_private_key" being present.

  function unlockVault() {
    if (!unlockPassword || !data.user) return;
    try {
      const rawKey = decryptWithPassword(
        data.user.privateKeyEncrypted,
        unlockPassword,
      );
      sessionStorage.setItem("notes_raw_private_key", rawKey);
      isVaultUnlocked = true;
      unlockPassword = ""; // clear memory
    } catch {
      unlockError = "Incorrect password";
    }
  }

  const notesList = $derived(data.user ? await getNotes() : []);

  // Initialize from localStorage and handle responsive behavior
  onMount(() => {
    if (data.user) {
      // Try to auto-unlock if key is already in session
      const existingKey = sessionStorage.getItem("notes_raw_private_key");
      if (existingKey) {
        isVaultUnlocked = true;
      } else {
        // Try temporary password from login redirect
        const tempPw = sessionStorage.getItem("notes_temp_password");
        if (tempPw) {
          unlockPassword = tempPw;
          unlockVault();
          sessionStorage.removeItem("notes_temp_password");
        }
      }
    }
  });

  onNavigate((navigation) => {
    const { promise, resolve } = Promise.withResolvers<void>();

    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });

    return promise;
  });
</script>

<svelte:window bind:innerWidth onkeydown={handleKeydown} />

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
  {#if isSetupRequired}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-base-300"
    >
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-primary">Setup Encryption</h2>

          <p class="text-sm text-base-content/70">
            Your account needs to be upgraded to support End-to-End Encryption.
            Please confirm your password to generate your secure keys.
          </p>

          {#if setupError}
            <div class="alert text-sm alert-error">{setupError}</div>
          {/if}

          <div class="form-control mt-2">
            <input
              type="password"
              placeholder="Current Password"
              class="input-bordered input"
              bind:value={setupPassword}
              onkeydown={(e) => e.key === "Enter" && handleSetupEncryption()}
              disabled={setupLoading}
            />
          </div>

          <div class="mt-4 card-actions justify-end">
            <form action="/logout" method="POST">
              <button class="btn btn-ghost" disabled={setupLoading}
                >Logout</button
              >
            </form>
            <button
              class="btn btn-primary"
              onclick={handleSetupEncryption}
              disabled={setupLoading}
            >
              {setupLoading ? "Setting up..." : "Upgrade Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else if !isVaultUnlocked}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-base-300"
    >
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-error">Unlock Your Vault</h2>
          <p>Enter your password to decrypt your private key.</p>
          {#if unlockError}
            <div class="alert text-sm alert-error">{unlockError}</div>
          {/if}
          <div class="form-control">
            <input
              type="password"
              placeholder="Password"
              class="input-bordered input"
              bind:value={unlockPassword}
              onkeydown={(e) => e.key === "Enter" && unlockVault()}
            />
          </div>
          <div class="card-actions justify-end">
            <button class="btn btn-primary" onclick={unlockVault}>Unlock</button
            >
            <!-- Allow logout if they forgot password -->
            <form action="/logout" method="POST">
              <button class="btn btn-ghost">Logout</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex h-screen overflow-hidden">
      <Sidebar
        user={data.user}
        {notesList}
        sharedNotes={data.sharedNotes}
        {isCollapsed}
        {toggleSidebar}
      />
      <div class="flex-1 overflow-auto">
        {@render children()}
      </div>
    </div>
  {/if}
{:else}
  {@render children()}
{/if}
