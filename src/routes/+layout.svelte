<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import favicon from "$lib/assets/favicon.svg";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { getNotes } from "$lib/remote/notes.remote.ts";
  import { setContext } from "svelte";
  import { SIDEBAR_CONTEXT_KEY } from "$lib/components/sidebar-context";

  import { decryptWithPassword } from "$lib/crypto.ts";

  // ... (previous imports)

  import { setupEncryption } from "$lib/remote/accounts.remote.ts";
  import {
    generateSigningKeyPair,
    generateEncryptionKeyPair,
    encryptWithPassword,
  } from "$lib/crypto.ts";

  // ... (previous imports)

  let { children, data } = $props();

  // Sidebar collapse state
  let isCollapsed = $state(false);

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

  async function unlockVault() {
    if (!unlockPassword || !data.user) return;
    try {
      const rawKey = await decryptWithPassword(
        data.user.privateKeyEncrypted,
        unlockPassword,
      );
      sessionStorage.setItem("notes_raw_private_key", rawKey);
      isVaultUnlocked = true;
      unlockPassword = ""; // clear memory
    } catch (e) {
      unlockError = "Incorrect password";
    }
  }

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
  }

  setContext(SIDEBAR_CONTEXT_KEY, {
    get isCollapsed() {
      return isCollapsed;
    },
    toggleSidebar,
  });

  const notesList = $derived(data.user ? await getNotes() : []);

  // Initialize from localStorage and handle responsive behavior
  onMount(() => {
    (async () => {
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
            await unlockVault();
            sessionStorage.removeItem("notes_temp_password");
          }
        }
      }
    })();

    // Load saved state from localStorage
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) {
      isCollapsed = saved === "true";
    } else {
      // Auto-collapse on mobile screens
      isCollapsed = window.innerWidth < 768;
    }

    // Handle window resize for automatic collapse
    const handleResize = () => {
      if (window.innerWidth < 768 && !isCollapsed) {
        isCollapsed = true;
      }
    };

    window.addEventListener("resize", handleResize);

    // Keyboard shortcut: Ctrl+B (or Cmd+B on Mac)
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  // Save to localStorage whenever state changes
  $effect(() => {
    localStorage.setItem("sidebarCollapsed", String(isCollapsed));
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
