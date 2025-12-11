import { json } from "@sveltejs/kit";
import { getServerIdentity } from "$lib/server/identity";

export async function GET() {
  const id = await getServerIdentity();
  return json({
    domain: id.domain,
    publicKey: id.publicKey,
  });
}
