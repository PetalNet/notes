import { guardLogin } from "$lib/server/auth.ts";

export const load = () => {
  const user = guardLogin();
  return { user };
};
