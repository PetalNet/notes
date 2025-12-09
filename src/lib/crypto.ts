import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { encodeBase64, decodeBase64 } from "@oslojs/encoding";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

// Use built-in randomBytes
function getRandomBytes(len: number) {
  if (typeof globalThis.crypto !== "undefined") {
    return globalThis.crypto.getRandomValues(new Uint8Array(len));
  }
  throw new Error("WebCrypto not available");
}

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
  const priv = ed25519.utils.randomSecretKey();
  const pub = await ed25519.getPublicKey(priv);
  return {
    publicKey: encodeBase64(pub),
    privateKey: encodeBase64(priv),
  };
}

export async function sign(
  message: Uint8Array,
  privateKeyBase64: string,
): Promise<string> {
  const priv = decodeBase64(privateKeyBase64);
  const signature = await ed25519.sign(message, priv);
  return encodeBase64(signature);
}

export async function verify(
  signatureBase64: string,
  message: Uint8Array,
  publicKeyBase64: string,
): Promise<boolean> {
  const sig = decodeBase64(signatureBase64);
  const pub = decodeBase64(publicKeyBase64);
  return ed25519.verify(sig, message, pub);
}

// ----------------------------------------------------------------------------
// Key Exchange / Encryption (X25519 + XChaCha20Poly1305)
// ----------------------------------------------------------------------------

export async function generateEncryptionKeyPair(): Promise<KeyPair> {
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  return {
    publicKey: encodeBase64(pub),
    privateKey: encodeBase64(priv),
  };
}

// Generate a random 32-byte key for the document
export function generateNoteKey(): string {
  const key = getRandomBytes(32);
  return encodeBase64(key);
}

/**
 * Encrypts the document key for a specific recipient device.
 * Uses an ephemeral key pair for the sender (anonymous).
 * Format: [ephemeral_pub (32)] + [nonce (24)] + [ciphertext]
 */
export function encryptKeyForDevice(
  noteKeyBase64: string,
  recipientPublicKeyBase64: string,
): string {
  const noteKey = decodeBase64(noteKeyBase64);
  const recipientPub = decodeBase64(recipientPublicKeyBase64);

  // 1. Generate ephemeral sender key
  const ephemeralPriv = x25519.utils.randomSecretKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // 2. ECDH Shared Secret
  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, recipientPub);

  // 3. HKDF to derive symmetric key
  const info = new TextEncoder().encode("notes-app-key-encryption");
  const derivedKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  // 4. Encrypt note key with XChaCha20Poly1305
  const nonce = getRandomBytes(24);
  const chacha = xchacha20poly1305(derivedKey, nonce);
  const ciphertext = chacha.encrypt(noteKey);

  // 5. Pack: ephemeralPub (32) + nonce (24) + ciphertext
  const result = new Uint8Array(32 + 24 + ciphertext.length);
  result.set(ephemeralPub, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 56);

  const encoded = encodeBase64(result);
  return encoded;
}

export function decryptKeyForDevice(
  encryptedEnvelopeBase64: string,
  devicePrivateKeyBase64: string,
): string {
  const envelope = decodeBase64(encryptedEnvelopeBase64);
  const devicePriv = decodeBase64(devicePrivateKeyBase64);

  if (envelope.length < 56) throw new Error("Envelope too short");

  const ephemeralPub = envelope.slice(0, 32);
  const nonce = envelope.slice(32, 56);
  const ciphertext = envelope.slice(56);

  const sharedSecret = x25519.getSharedSecret(devicePriv, ephemeralPub);
  const info = new TextEncoder().encode("notes-app-key-encryption");
  const derivedKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  const chacha = xchacha20poly1305(derivedKey, nonce);
  const noteKey = chacha.decrypt(ciphertext);

  return encodeBase64(noteKey);
}

// ----------------------------------------------------------------------------
// Content Encryption (XChaCha20Poly1305)
// ----------------------------------------------------------------------------

export function encryptData(
  data: Uint8Array,
  noteKeyBase64: string,
): Uint8Array {
  const key = decodeBase64(noteKeyBase64);

  // Per message nonce
  const nonce = getRandomBytes(24);
  const chacha = xchacha20poly1305(key, nonce);
  const ciphertext = chacha.encrypt(data);

  // Prepend nonce
  const result = new Uint8Array(24 + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, 24);
  return result;
}

export function decryptData(
  encrypted: Uint8Array,
  noteKeyBase64: string,
): Uint8Array {
  const key = decodeBase64(noteKeyBase64);

  // Extract IV from first 24 bytes
  const nonce = encrypted.slice(0, 24);
  const ciphertext = encrypted.slice(24);

  const chacha = xchacha20poly1305(key, nonce);
  return chacha.decrypt(ciphertext);
}

// ----------------------------------------------------------------------------
// Aliases for Client Compatibility
// ----------------------------------------------------------------------------

export const encryptKeyForUser = encryptKeyForDevice;
export const decryptKey = decryptKeyForDevice;
export const generateUserKeys = generateEncryptionKeyPair;
