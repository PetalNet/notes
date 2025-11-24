/**
 * WebCrypto utilities for E2EE
 */

import { Either, Encoding } from "effect";

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export async function generateUserKeys(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const publicKeyData = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey,
  );
  const privateKeyData = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );

  return {
    publicKey: Encoding.encodeBase64(new Uint8Array(publicKeyData)),

    // TODO: Proper encryption
    // For now, encode private key to base64
    // In production, use PBKDF2 to derive encryption key
    privateKey: Encoding.encodeBase64(new Uint8Array(privateKeyData)),
  };
}

export async function generateNoteKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  );

  const keyData = await crypto.subtle.exportKey("raw", key);
  return Encoding.encodeBase64(new Uint8Array(keyData));
}

export async function encryptKeyForUser(
  noteKey: string,
  recipientPublicKey: string,
): Promise<string> {
  const keyBuffer = Encoding.decodeBase64(noteKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;
  const publicKeyBuffer = Encoding.decodeBase64(recipientPublicKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;

  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    keyBuffer,
  );

  return Encoding.encodeBase64(new Uint8Array(encrypted));
}

export async function decryptKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  const encryptedBuffer = Encoding.decodeBase64(encryptedKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;
  const privateKeyBuffer = Encoding.decodeBase64(privateKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    key,
    encryptedBuffer,
  );

  return Encoding.encodeBase64(new Uint8Array(decrypted));
}

export async function encryptData(
  data: Uint8Array<ArrayBuffer>,
  noteKey: string,
): Promise<Uint8Array> {
  const keyBuffer = Encoding.decodeBase64(noteKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  );

  // Prepend IV to encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

export async function decryptData(
  encrypted: Uint8Array,
  noteKey: string,
): Promise<Uint8Array> {
  const keyBuffer = Encoding.decodeBase64(noteKey).pipe(
    Either.getOrThrow,
  ) as Uint8Array<ArrayBuffer>;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"],
  );

  // Extract IV from first 12 bytes
  const iv = encrypted.slice(0, 12);
  const data = encrypted.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  );

  return new Uint8Array(decrypted);
}
