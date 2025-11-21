import { json } from "@sveltejs/kit";

export const POST = async ({ cookies }) => {
  cookies.delete("auth-session", { path: "/" });
  return json({ success: true });
};
