import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
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

export function generateSigningKeyPair(): KeyPair {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  return {
    publicKey: pub.toBase64(),
    privateKey: priv.toBase64(),
  };
}

export function sign(message: Uint8Array, privateKeyBase64: string): string {
  const priv = Uint8Array.fromBase64(privateKeyBase64);
  const signature = ed25519.sign(message, priv);
  return signature.toBase64();
}

export function verify(
  signatureBase64: string,
  message: Uint8Array,
  publicKeyBase64: string,
): boolean {
  const sig = Uint8Array.fromBase64(signatureBase64);
  const pub = Uint8Array.fromBase64(publicKeyBase64);
  return ed25519.verify(sig, message, pub);
}

// ----------------------------------------------------------------------------
// Key Exchange / Encryption (X25519 + XChaCha20Poly1305)
// ----------------------------------------------------------------------------

export function generateEncryptionKeyPair(): KeyPair {
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  return {
    publicKey: pub.toBase64(),
    privateKey: priv.toBase64(),
  };
}

// Generate a random 32-byte key for the document
export function generateNoteKey(): string {
  const key = getRandomBytes(32);
  return key.toBase64();
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
  const noteKey = Uint8Array.fromBase64(noteKeyBase64);
  const recipientPub = Uint8Array.fromBase64(recipientPublicKeyBase64);

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

  const encoded = result.toBase64();
  return encoded;
}

export function decryptKeyForDevice(
  encryptedEnvelopeBase64: string,
  devicePrivateKeyBase64: string,
): string {
  const envelope = Uint8Array.fromBase64(encryptedEnvelopeBase64);
  const devicePriv = Uint8Array.fromBase64(devicePrivateKeyBase64);

  if (envelope.length < 56) throw new Error("Envelope too short");

  const ephemeralPub = envelope.slice(0, 32);
  const nonce = envelope.slice(32, 56);
  const ciphertext = envelope.slice(56);

  const sharedSecret = x25519.getSharedSecret(devicePriv, ephemeralPub);
  const info = new TextEncoder().encode("notes-app-key-encryption");
  const derivedKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  const chacha = xchacha20poly1305(derivedKey, nonce);
  const noteKey = chacha.decrypt(ciphertext);

  return noteKey.toBase64();
}

// ----------------------------------------------------------------------------
// Content Encryption (XChaCha20Poly1305)
// ----------------------------------------------------------------------------

export function encryptData(
  data: Uint8Array,
  noteKeyBase64: string,
): Uint8Array {
  const key = Uint8Array.fromBase64(noteKeyBase64);

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
  const key = Uint8Array.fromBase64(noteKeyBase64);

  // Extract IV from first 24 bytes
  const nonce = encrypted.slice(0, 24);
  const ciphertext = encrypted.slice(24);

  const chacha = xchacha20poly1305(key, nonce);
  return chacha.decrypt(ciphertext);
}

export const encryptKeyForUser = encryptKeyForDevice;
export const decryptKey = decryptKeyForDevice;
export const generateUserKeys = generateEncryptionKeyPair;

// ----------------------------------------------------------------------------
// Password Encryption (PBKDF2 + XChaCha20Poly1305)
// ----------------------------------------------------------------------------

import { pbkdf2 } from "@noble/hashes/pbkdf2.js";

export function encryptWithPassword(
  dataBase64: string,
  password: string,
): string {
  const data = Uint8Array.fromBase64(dataBase64);
  const salt = getRandomBytes(16);
  // Derive key from password
  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });

  // Encrypt
  const nonce = getRandomBytes(24);
  const chacha = xchacha20poly1305(kek, nonce);
  const ciphertext = chacha.encrypt(data);

  // Pack: salt(16) + nonce(24) + ciphertext
  const result = new Uint8Array(16 + 24 + ciphertext.length);
  result.set(salt, 0);
  result.set(nonce, 16);
  result.set(ciphertext, 40);

  return result.toBase64();
}

export function decryptWithPassword(
  encryptedBase64: string,
  password: string,
): string {
  const encrypted = Uint8Array.fromBase64(encryptedBase64);

  if (encrypted.length < 40) throw new Error("Encrypted data too short");

  const salt = encrypted.slice(0, 16);
  const nonce = encrypted.slice(16, 40);
  const ciphertext = encrypted.slice(40);

  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });
  const chacha = xchacha20poly1305(kek, nonce);

  try {
    const data = chacha.decrypt(ciphertext);
    return data.toBase64();
  } catch {
    throw new Error("Incorrect password or corrupted data");
  }
}
