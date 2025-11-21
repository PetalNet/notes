<script lang="ts">
  import { goto } from "$app/navigation";

  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleLogin() {
    if (!username || !password) {
      error = "Username and password are required";
      return;
    }

    loading = true;
    error = "";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }

      goto("/");
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title">Log In</h2>

      {#if error}
        <div class="alert alert-error">
          <span>{error}</span>
        </div>
      {/if}

      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <div class="form-control">
          <label class="label" for="username">
            <span class="label-text">Username</span>
          </label>
          <input
            id="username"
            type="text"
            bind:value={username}
            class="input-bordered input"
            disabled={loading}
          />
        </div>

        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">Password</span>
          </label>
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
            {loading ? "Logging in..." : "Log In"}
          </button>
        </div>
      </form>

      <div class="divider">OR</div>
      <a href="/signup" class="btn btn-ghost">Don't have an account? Sign up</a>
    </div>
  </div>
</div>
