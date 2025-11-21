// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { SessionValidationResult } from "$lib/server/auth.ts";

declare global {
  namespace App {
    interface Locals {
      user: SessionValidationResult["user"];
      session: SessionValidationResult["session"];
    }

    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
