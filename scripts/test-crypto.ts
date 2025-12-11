import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";

function encryptWithPassword(
  dataBase64: string,
  password: string,
): Uint8Array<ArrayBuffer> {
  const data = Uint8Array.from(dataBase64);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Derive key from password
  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });

  // Encrypt
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const chacha = xchacha20poly1305(kek, nonce);
  const ciphertext = chacha.encrypt(data);

  // Pack: salt + nonce + ciphertext
  const result = new Uint8Array(16 + 24 + ciphertext.length);
  result.set(salt, 0);
  result.set(nonce, 16);
  result.set(ciphertext, 40);

  return Uint8Array.from(result);
}

function decryptWithPassword(
  encryptedBase64: Uint8Array<ArrayBuffer>,
  password: string,
): Uint8Array<ArrayBuffer> {
  const salt = encryptedBase64.slice(0, 16);
  const nonce = encryptedBase64.slice(16, 40);
  const ciphertext = encryptedBase64.slice(40);

  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });
  const chacha = xchacha20poly1305(kek, nonce);
  const data = chacha.decrypt(ciphertext);

  return Uint8Array.from(data);
}

const rawData = "This is a secret key";
const rawBase64 = new TextEncoder().encode(rawData).toBase64();
const pass = "password123";

console.log("Original:", rawData);
const encrypted = encryptWithPassword(rawBase64, pass);
console.log("Encrypted:", encrypted);

const decryptedBase64 = decryptWithPassword(encrypted, pass);
const decrypted = new TextDecoder().decode(decryptedBase64);
console.log("Decrypted:", decrypted);

if (rawData === decrypted) {
  console.log("PASS");
} else {
  console.error("FAIL");
  process.exit(1);
}
