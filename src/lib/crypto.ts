/**
 * WebCrypto utilities for E2EE
 */

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
    publicKey: new Uint8Array(publicKeyData).toBase64(),

    // TODO: Proper encryption
    // For now, encode private key to base64
    // In production, use PBKDF2 to derive encryption key
    privateKey: new Uint8Array(privateKeyData).toBase64(),
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
  return new Uint8Array(keyData).toBase64();
}

export async function encryptKeyForUser(
  noteKey: string,
  recipientPublicKey: string,
): Promise<string> {
  const keyBuffer = Uint8Array.fromBase64(noteKey);
  const publicKeyBuffer = Uint8Array.fromBase64(recipientPublicKey);

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

  return new Uint8Array(encrypted).toBase64();
}

export async function decryptKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  const encryptedBuffer = Uint8Array.fromBase64(encryptedKey);
  const privateKeyBuffer = Uint8Array.fromBase64(privateKey);

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

  return new Uint8Array(decrypted).toBase64();
}

async function getCryptoKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const keyBuffer = Uint8Array.fromBase64(base64Key);
  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"],
  );
}

const IV_LENGTH = 12; // AES-GCM standard IV length

export async function encryptData(
  data: Uint8Array<ArrayBuffer>,
  noteKey: string,
): Promise<Uint8Array> {
  const key = await getCryptoKeyFromBase64(noteKey);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
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
  const key = await getCryptoKeyFromBase64(noteKey);

  // Extract IV from first 12 bytes
  const iv = encrypted.slice(0, IV_LENGTH);
  const data = encrypted.slice(IV_LENGTH);

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
