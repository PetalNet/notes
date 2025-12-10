import { json } from "@sveltejs/kit";
import { getServerIdentity } from "$lib/server/identity";

export async function GET() {
  const identity = await getServerIdentity();

  return json({
    domain: identity.domain,
    publicKey: identity.publicKey, // Signing
    encryptionPublicKey: identity.encryptionPublicKey, // Broker
  });
}
