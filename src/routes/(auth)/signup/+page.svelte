<script lang="ts">
  import { resolve } from "$app/paths";
  import { generateUserKeys, encryptWithPassword } from "$lib/crypto.ts";
  import { signup } from "$lib/remote/accounts.remote.ts";
  import { signupSchema } from "$lib/remote/accounts.schema.ts";

  let publicKeyInput: HTMLInputElement;
  let privateKeyInput: HTMLInputElement;
  let formElement: HTMLFormElement;
  let submitButton: HTMLButtonElement;
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

      <form {...signup.preflight(signupSchema)} bind:this={formElement}>
        <input type="hidden" name="publicKey" bind:this={publicKeyInput} />
        <input
          type="hidden"
          name="privateKeyEncrypted"
          bind:this={privateKeyInput}
        />

        <fieldset disabled={signup.pending !== 0}>
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
              type="button"
              class="btn btn-primary"
              disabled={signup.pending !== 0}
              bind:this={submitButton}
              onclick={async () => {
                // 1. Basic validation check (by forcing validation on the schema wrapper)
                await signup.validate({
                  includeUntouched: true,
                  preflightOnly: true,
                });

                // If there are issues (username/password), stop here.
                // We ignore the missing keys for now as they aren't generated yet.
                const issues = signup.fields
                  .allIssues()
                  ?.filter(
                    (i) =>
                      i.path.includes("username") ||
                      i.path.includes("_password"),
                  );
                if (issues && issues.length > 0) return;

                // 2. Generate Keys
                const { publicKey, privateKey } = await generateUserKeys(); // privateKey is base64 raw

                // 3. Encrypt
                // Get password value directly from schema store or input?
                // The schema store `.value` holds the current value.
                let password = signup.fields._password.value;
                if (typeof password === "function") {
                  // @ts-ignore - Signal getter
                  password = password();
                }
                if (!password) return; // Should be caught by validation

                const encryptedWithPw = await encryptWithPassword(
                  privateKey,
                  password as unknown as string,
                );

                // 4. Populate hidden fields
                publicKeyInput.value = publicKey;
                privateKeyInput.value = encryptedWithPw;

                // 5. Cache Key for Auto-Unlock
                sessionStorage.setItem("notes_raw_private_key", privateKey);

                // 6. Submit Form Directly
                formElement.requestSubmit();
              }}
            >
              {signup.pending !== 0 ? "Creating Account..." : "Next"}
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
