import { env } from "$env/dynamic/private";
import {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  sign,
} from "$lib/crypto";
import { Schema } from "effect";
import fs from "node:fs/promises";

const IDENTITY_FILE = env["SERVER_IDENTITY_FILE"] ?? "server-identity.json";

const ServerIdentitySchema = Schema.Struct({
  publicKey: Schema.String, // Ed25519 (Signing)
  privateKey: Schema.String,
  encryptionPublicKey: Schema.String, // X25519 (Broker Encryption)
  encryptionPrivateKey: Schema.String,
  domain: Schema.String,
}).pipe(Schema.mutable);

type ServerIdentity = typeof ServerIdentitySchema.Type;

const serverIdentityJson = Schema.parseJson(ServerIdentitySchema);

// Singleton identity
// Gosh plz no...
// TODO: remove this abomination.
let identity: ServerIdentity | null = null;

export async function getServerIdentity(): Promise<ServerIdentity> {
  if (identity) return identity;

  const domain = env["SERVER_DOMAIN"] ?? "localhost:5173";

  try {
    const data = await fs.readFile(IDENTITY_FILE, "utf-8");
    const loaded = Schema.decodeUnknownSync(serverIdentityJson)(data);

    // Backwards compatibility: Generate encryption keys if missing
    if (loaded.publicKey && !loaded.encryptionPublicKey) {
      console.log("Upgrading server identity with encryption keys...");
      const encParams = generateEncryptionKeyPair();
      loaded.encryptionPublicKey = encParams.publicKey;
      loaded.encryptionPrivateKey = encParams.privateKey;
      await fs.writeFile(IDENTITY_FILE, JSON.stringify(loaded, null, 2));
    }

    identity = loaded;
    identity.domain = domain;

    return identity;
  } catch {
    console.warn("No existing server identity found, generating new one...");
  }

  // Generate new
  console.log("Generating new server identity...");
  const signKeys = generateSigningKeyPair(); // Ed25519
  const encKeys = generateEncryptionKeyPair(); // X25519

  identity = {
    publicKey: signKeys.publicKey,
    privateKey: signKeys.privateKey,
    encryptionPublicKey: encKeys.publicKey,
    encryptionPrivateKey: encKeys.privateKey,
    domain,
  };

  await fs.writeFile(IDENTITY_FILE, JSON.stringify(identity, null, 2));
  return identity;
}

export async function signServerRequest(
  payload: any,
): Promise<{ signature: string; timestamp: number; domain: string }> {
  const id = await getServerIdentity();
  const timestamp = Date.now();
  // Deterministic canonical JSON needed? Or just sign payload string/bytes?
  // Let's sign: domain + timestamp + JSON.stringify(payload)
  const msg = `${id.domain}:${timestamp}:${JSON.stringify(payload)}`;
  const sig = sign(new TextEncoder().encode(msg), id.privateKey);
  return {
    signature: sig,
    timestamp,
    domain: id.domain,
  };
}
