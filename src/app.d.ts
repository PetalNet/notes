// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { ResolvedPathname } from "$app/types";
import type { User } from "$lib/schema.ts";
import type { Session } from "$lib/server/auth.ts";
import type { HTMLAnchorAttributes } from "svelte/elements";

declare global {
  namespace App {
    interface Locals {
      user: User | undefined;
      session: Session | undefined;
    }

    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  namespace svelteHTML {
    interface IntrinsicElements {
      a: Omit<HTMLAnchorAttributes, "href"> & {
        // The (string & {}) trick prevents 'string' from collapsing the union,
        // preserving Intellisense for your Pathnames.
        href?: ResolvedPathname | (string & {}) | null;
      };
    }
  }
}
