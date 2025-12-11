import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from "@hpke/core";

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface KeyPair {
  publicKey: string; // Base64
  privateKey: string; // Base64
}

export interface DeviceKeys {
  signing: KeyPair;
  encryption: KeyPair;
}

// ----------------------------------------------------------------------------
// Identity / Signing (Ed25519)
// ----------------------------------------------------------------------------

export async function generateSigningKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);

  const pub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: new Uint8Array(pub).toBase64(),
    privateKey: new Uint8Array(priv).toBase64(),
  };
}

export async function sign(
  message: Uint8Array<ArrayBuffer>,
  privateKeyBase64: string,
): Promise<string> {
  const privBytes = Uint8Array.fromBase64(privateKeyBase64);
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    privBytes,
    "Ed25519",
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("Ed25519", privKey, message);
  return new Uint8Array(signature).toBase64();
}

export async function verify(
  signatureBase64: string,
  message: Uint8Array<ArrayBuffer>,
  publicKeyBase64: string,
): Promise<boolean> {
  const sigBytes = Uint8Array.fromBase64(signatureBase64);
  const pubBytes = Uint8Array.fromBase64(publicKeyBase64);
  const pubKey = await crypto.subtle.importKey(
    "raw",
    pubBytes,
    "Ed25519",
    false,
    ["verify"],
  );
  return crypto.subtle.verify("Ed25519", pubKey, sigBytes, message);
}

// ----------------------------------------------------------------------------
// Key Exchange / Encryption (HPKE: X25519 + HKDF + ChaCha20Poly1305)
// ----------------------------------------------------------------------------

export async function generateEncryptionKeyPair(): Promise<KeyPair> {
  const keyPair = await suite.kem.generateKeyPair();
  const pub = await suite.kem.serializePublicKey(keyPair.publicKey);
  const priv = await suite.kem.serializePrivateKey(keyPair.privateKey);

  return {
    publicKey: new Uint8Array(pub).toBase64(),
    privateKey: new Uint8Array(priv).toBase64(),
  };
}

// Generate a random 32-byte key for the document
export function generateNoteKey(): string {
  const key = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return key.toBase64();
}

/**
 * Encrypts the document key for a specific recipient device using HPKE.
 * Format: [enc (32)] + [ciphertext]
 */
export async function encryptKeyForDevice(
  noteKeyBase64: string,
  recipientPublicKeyBase64: string,
): Promise<string> {
  const noteKey = Uint8Array.fromBase64(noteKeyBase64);
  const recipientPub = Uint8Array.fromBase64(recipientPublicKeyBase64);

  const recipientPublicKey = await suite.kem.importKey(
    "raw",
    recipientPub.buffer,
    true,
  );

  const { ct, enc } = await suite.seal({ recipientPublicKey }, noteKey.buffer);

  // Pack: enc (32) + ct
  const result = new Uint8Array(enc.byteLength + ct.byteLength);
  result.set(new Uint8Array(enc), 0);
  result.set(new Uint8Array(ct), enc.byteLength);

  return result.toBase64();
}

export async function decryptKeyForDevice(
  encryptedEnvelopeBase64: string,
  devicePrivateKeyBase64: string,
): Promise<string> {
  const envelope = Uint8Array.fromBase64(encryptedEnvelopeBase64);
  const devicePriv = Uint8Array.fromBase64(devicePrivateKeyBase64);

  if (envelope.length < 32) throw new Error("Envelope too short");

  const enc = envelope.slice(0, 32);
  const ct = envelope.slice(32);

  const recipientKey = await suite.kem.importKey(
    "raw",
    devicePriv.buffer,
    false,
  );

  const noteKey = await suite.open(
    { recipientKey, enc: enc.buffer },
    ct.buffer,
  );

  return new Uint8Array(noteKey).toBase64();
}

// ----------------------------------------------------------------------------
// Content Encryption (ChaCha20Poly1305)
// ----------------------------------------------------------------------------

export async function encryptData(
  data: Uint8Array,
  noteKeyBase64: string,
): Promise<Uint8Array> {
  const key = Uint8Array.fromBase64(noteKeyBase64);
  const aead = new Chacha20Poly1305();
  const ctx = aead.createEncryptionContext(key.buffer);

  // Per message nonce (12 bytes for standard ChaCha20Poly1305)
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await ctx.seal(
    nonce.buffer,
    data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer,
    new ArrayBuffer(0),
  );

  // Prepend nonce
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

export async function decryptData(
  encrypted: Uint8Array,
  noteKeyBase64: string,
): Promise<Uint8Array> {
  const key = Uint8Array.fromBase64(noteKeyBase64);
  const aead = new Chacha20Poly1305();
  const ctx = aead.createEncryptionContext(key.buffer);

  // Extract IV from first 12 bytes
  const nonce = encrypted.slice(0, 12);
  const ciphertext = encrypted.slice(12);

  const decrypted = await ctx.open(
    nonce.buffer,
    ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ),
    new ArrayBuffer(0),
  );
  return new Uint8Array(decrypted);
}

export const encryptKeyForUser = encryptKeyForDevice;
export const decryptKey = decryptKeyForDevice;
export const generateUserKeys = generateEncryptionKeyPair;

// ----------------------------------------------------------------------------
// Password Encryption (PBKDF2 + ChaCha20Poly1305)
// ----------------------------------------------------------------------------

export async function encryptWithPassword(
  dataBase64: string,
  password: string,
): Promise<string> {
  const data = Uint8Array.fromBase64(dataBase64);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // Derive key from password
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const kekBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    passwordKey,
    256, // 32 bytes
  );

  const aead = new Chacha20Poly1305();
  const ctx = aead.createEncryptionContext(kekBits);

  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await ctx.seal(
    nonce.buffer,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    new ArrayBuffer(0),
  );

  // Pack: salt(16) + nonce(12) + ciphertext
  const result = new Uint8Array(16 + 12 + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(nonce, 16);
  result.set(new Uint8Array(ciphertext), 28);

  return result.toBase64();
}

export async function decryptWithPassword(
  encryptedBase64: string,
  password: string,
): Promise<string> {
  const encrypted = Uint8Array.fromBase64(encryptedBase64);

  if (encrypted.length < 28) throw new Error("Encrypted data too short");

  const salt = encrypted.slice(0, 16);
  const nonce = encrypted.slice(16, 28);
  const ciphertext = encrypted.slice(28);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const kekBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    passwordKey,
    256,
  );

  const aead = new Chacha20Poly1305();
  const ctx = aead.createEncryptionContext(kekBits);

  try {
    const data = await ctx.open(
      nonce.buffer,
      ciphertext.buffer.slice(
        ciphertext.byteOffset,
        ciphertext.byteOffset + ciphertext.byteLength,
      ),
      new ArrayBuffer(0),
    );
    return new Uint8Array(data).toBase64();
  } catch {
    throw new Error("Incorrect password or corrupted data");
  }
}
