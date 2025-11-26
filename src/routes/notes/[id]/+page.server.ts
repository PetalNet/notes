import { guardLogin } from "$lib/server/auth.ts";

export const load = (): void => {
  guardLogin();
};
