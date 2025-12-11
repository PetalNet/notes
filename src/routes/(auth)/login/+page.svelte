<script lang="ts">
  import { resolve } from "$app/paths";
  import { login } from "$lib/remote/accounts.remote.ts";
  import { loginSchema } from "$lib/remote/accounts.schema.ts";
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 text-primary shadow-xl">
    <div class="card-body">
      <h2 class="card-title">Log In</h2>

      {#each login.fields.allIssues() as issue (issue.path)}
        <!-- TODO: make per field, use daisyui's validator-hint.  -->
        <div class="alert alert-error">
          <p>{issue.message}</p>
        </div>
      {/each}

      <form
        {...login
          .preflight(loginSchema)
          .enhance(async ({ data: { _password }, submit }) => {
            // Cache password for the layout to use for decryption
            if (_password) {
              sessionStorage.setItem("notes_temp_password", _password);
            }

            // TODO: do we even need this?
            await submit();
          })}
      >
        <fieldset disabled={login.pending !== 0}>
          <div class="form-control">
            <label>
              <div class="label">
                <span class="label-text">Username</span>
              </div>
              <input {...login.fields.username.as("text")} class=" input" />
            </label>
          </div>

          <div class="form-control">
            <label>
              <div class="label">
                <span class="label-text">Password</span>
              </div>
              <input {...login.fields._password.as("password")} class="input" />
            </label>
          </div>

          <div class="form-control mt-6">
            <button
              type="submit"
              class="btn btn-primary"
              disabled={login.pending !== 0}
            >
              {login.pending !== 0 ? "Logging in..." : "Log In"}
            </button>
          </div>
        </fieldset>
      </form>

      <div class="divider">OR</div>
      <a href={resolve("/signup")} class="btn btn-ghost"
        >Don't have an account? Sign up</a
      >
    </div>
  </div>
</div>
