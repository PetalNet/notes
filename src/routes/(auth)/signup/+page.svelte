<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { generateUserKeys } from "$lib/crypto";

  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSignup() {
    if (!username || !password) {
      error = "Username and password are required";
      return;
    }

    loading = true;
    error = "";

    try {
      // Generate encryption keys
      const { publicKey, privateKey } = await generateUserKeys();

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          publicKey,
          privateKeyEncrypted: privateKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Signup failed");
      }

      goto(resolve("/"));
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 text-primary shadow-xl">
    <div class="card-body">
      <h2 class="card-title">Sign Up</h2>

      {#if error}
        <div class="alert alert-error">
          <span>{error}</span>
        </div>
      {/if}

      <form
        onsubmit={async (e) => {
          e.preventDefault();
          await handleSignup();
        }}
      >
        <div class="form-control">
          <label class="label" for="username">Username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            class="input-bordered input"
            disabled={loading}
          />
        </div>

        <div class="form-control">
          <label class="label" for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            class="input-bordered input"
            disabled={loading}
          />
        </div>

        <div class="form-control mt-6">
          <button type="submit" class="btn btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </div>
      </form>

      <div class="divider">OR</div>
      <a href={resolve("/login")} class="btn btn-ghost"
        >Already have an account? Log in</a
      >
    </div>
  </div>
</div>
