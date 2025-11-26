<script lang="ts">
  import "./layout.css";

  import { onNavigate } from "$app/navigation";
  import favicon from "$lib/assets/favicon.svg";
  import { setUserPrivateKey } from "$lib/context";

  let { children, data } = $props();

  // TODO: Decrypt private key with password
  // For now, using the encrypted key as-is (needs proper PBKDF2 implementation)
  if (data.user?.privateKeyEncrypted) {
    // In production, this should decrypt with user's password
    // The crypto functions expect base64-encoded strings, so pass as-is
    setUserPrivateKey(data.user.privateKeyEncrypted);
  }

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

{@render children()}
