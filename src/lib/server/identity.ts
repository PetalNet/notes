import { env } from "$env/dynamic/private";
import {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  sign,
} from "$lib/crypto";
import fs from "node:fs/promises";

const IDENTITY_FILE = env["SERVER_IDENTITY_FILE"] ?? "server-identity.json";

interface ServerIdentity {
  publicKey: string; // Ed25519 (Signing)
  privateKey: string;
  encryptionPublicKey: string; // X25519 (Broker Encryption)
  encryptionPrivateKey: string;
  domain: string;
}

// Singleton identity
// Gosh plz no...
// TODO: remove this abomination.
let identity: ServerIdentity | null = null;

export async function getServerIdentity(): Promise<ServerIdentity> {
  if (identity) return identity;

  // TODO: Determine domain dynamically or from config
  const domain = process.env["SERVER_DOMAIN"] ?? "localhost:5173";

  try {
    const data = await fs.readFile(IDENTITY_FILE, "utf-8");
    const loaded = JSON.parse(data) as unknown as ServerIdentity;

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
