import { generateSigningKeyPair, sign } from "$lib/crypto";
import fs from "node:fs";
import path from "node:path";

const IDENTITY_FILE =
  process.env["SERVER_IDENTITY_FILE"] || "server-identity.json";

interface ServerIdentity {
  publicKey: string;
  privateKey: string;
  domain: string;
}

// Singleton identity
let identity: ServerIdentity | null = null;

export async function getServerIdentity(): Promise<ServerIdentity> {
  if (identity) return identity;

  // TODO: Determine domain dynamically or from config
  const domain = process.env["SERVER_DOMAIN"] || "localhost:5173";

  if (fs.existsSync(IDENTITY_FILE)) {
    const data = fs.readFileSync(IDENTITY_FILE, "utf-8");
    identity = JSON.parse(data);
    if (identity && identity.publicKey && identity.privateKey) {
      // update domain if changed via env
      identity.domain = domain;
      return identity;
    }
  }

  // Generate new
  console.log("Generating new server identity...");
  const keyPair = await generateSigningKeyPair(); // Ed25519
  identity = {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    domain,
  };

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
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
  const sig = await sign(new TextEncoder().encode(msg), id.privateKey);
  return {
    signature: sig,
    timestamp,
    domain: id.domain,
  };
}
