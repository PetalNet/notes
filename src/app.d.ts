// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { User } from "$lib/schema.ts";
import type { Session } from "$lib/server/auth.ts";

declare global {
  namespace App {
    interface Locals {
      user: User | undefined;
      session: Session;
    }

    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
