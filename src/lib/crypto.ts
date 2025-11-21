/**
 * WebCrypto utilities for E2EE
 */

export async function generateUserKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
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
    publicKey: arrayBufferToBase64(publicKeyData),
    privateKey: arrayBufferToBase64(privateKeyData),
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
  return arrayBufferToBase64(keyData);
}

export async function encryptKeyForUser(
  noteKey: string,
  recipientPublicKey: string,
): Promise<string> {
  const keyBuffer = base64ToArrayBuffer(noteKey);
  const publicKeyBuffer = base64ToArrayBuffer(recipientPublicKey);

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

  return arrayBufferToBase64(encrypted);
}

export async function decryptKey(
  encryptedKey: string,
  privateKey: string,
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedKey);
  const privateKeyBuffer = base64ToArrayBuffer(privateKey);

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

  return arrayBufferToBase64(decrypted);
}

export async function encryptData(
  data: Uint8Array<ArrayBuffer>,
  noteKey: string,
): Promise<Uint8Array> {
  const keyBuffer = base64ToArrayBuffer(noteKey);
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
  const keyBuffer = base64ToArrayBuffer(noteKey);
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

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
