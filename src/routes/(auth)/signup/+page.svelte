<script lang="ts">
  import { resolve } from "$app/paths";
  import { generateUserKeys } from "$lib/crypto.ts";
  import { signup } from "$lib/remote/accounts.remote.ts";
  import { signupSchema } from "$lib/remote/accounts.schema.ts";

  let publicKeyInput: HTMLInputElement;
  let privateKeyInput: HTMLInputElement;

  let isSubmutting = $derived(signup.pending !== 0);
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
  <div class="card w-96 bg-base-100 text-primary shadow-xl">
    <div class="card-body">
      <h2 class="card-title">Sign Up</h2>

      {#each signup.fields.allIssues() as issue (issue.path)}
        <div class="alert alert-error">
          <p>{issue.message}</p>
        </div>
      {/each}

      <form {...signup.preflight(signupSchema)}>
        <input type="hidden" name="publicKey" bind:this={publicKeyInput} />
        <input
          type="hidden"
          name="privateKeyEncrypted"
          bind:this={privateKeyInput}
        />
        <fieldset disabled={isSubmutting}>
          <div class="form-control">
            <label>
              <div class="label">
                <span class="label-text">Username</span>
              </div>
              <input {...signup.fields.username.as("text")} class=" input" />
            </label>
          </div>

          <div class="form-control">
            <label>
              <div class="label">
                <span class="label-text">Password</span>
              </div>
              <input
                {...signup.fields._password.as("password")}
                class="input"
              />
            </label>
          </div>

          <div class="form-control mt-6">
            <button
              type="submit"
              class="btn btn-primary"
              disabled={isSubmutting}
              onclick={async (e) => {
                // We require client-side JS to generate the key.
                // SvelteKit enforces that enhance is purely for enhancement.
                // Therefore, we have to submit the form from in here to make it explicit
                // that there is no fallback.

                e.preventDefault();
                const submitter = e.currentTarget;

                // Generate encryption keys
                const { publicKey, privateKey } = await generateUserKeys();

                publicKeyInput.value = publicKey.toBase64();
                privateKeyInput.value = privateKey.toBase64();

                await signup.validate({
                  includeUntouched: true,
                  preflightOnly: true,
                });
                console.debug(signup.fields.allIssues());

                if ((signup.fields.allIssues()?.length ?? 0) !== 0) return;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- It is indeed a child of a form.
                submitter.form!.requestSubmit(submitter);
              }}
            >
              {isSubmutting ? "Logging in..." : "Log In"}
            </button>
          </div>
        </fieldset>
      </form>

      <div class="divider">OR</div>
      <a href={resolve("/login")} class="btn btn-ghost"
        >Already have an account? Log in</a
      >
    </div>
  </div>
</div>
