import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "crypto"; // Node generic

// Mimic browser primitives
const encodeBase64 = (arr) => Buffer.from(arr).toString("base64");
const decodeBase64 = (str) => new Uint8Array(Buffer.from(str, "base64"));
const getRandomBytes = (len) => new Uint8Array(randomBytes(len));

async function encryptWithPassword(dataBase64, password) {
  const data = decodeBase64(dataBase64);
  const salt = getRandomBytes(16);
  // Derive key from password
  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });

  // Encrypt
  const nonce = getRandomBytes(24);
  const chacha = xchacha20poly1305(kek, nonce);
  const ciphertext = chacha.encrypt(data);

  // Pack: salt + nonce + ciphertext
  const result = new Uint8Array(16 + 24 + ciphertext.length);
  result.set(salt, 0);
  result.set(nonce, 16);
  result.set(ciphertext, 40);

  return encodeBase64(result);
}

async function decryptWithPassword(encryptedBase64, password) {
  const encrypted = decodeBase64(encryptedBase64);
  const salt = encrypted.slice(0, 16);
  const nonce = encrypted.slice(16, 40);
  const ciphertext = encrypted.slice(40);

  const kek = pbkdf2(sha256, password, salt, { c: 600000, dkLen: 32 });
  const chacha = xchacha20poly1305(kek, nonce);
  const data = chacha.decrypt(ciphertext);
  return encodeBase64(data);
}

async function test() {
  const rawData = "This is a secret key";
  const rawBase64 = encodeBase64(new TextEncoder().encode(rawData));
  const pass = "password123";

  console.log("Original:", rawData);
  const encrypted = await encryptWithPassword(rawBase64, pass);
  console.log("Encrypted:", encrypted);

  const decryptedBase64 = await decryptWithPassword(encrypted, pass);
  const decrypted = new TextDecoder().decode(decodeBase64(decryptedBase64));
  console.log("Decrypted:", decrypted);

  if (rawData === decrypted) {
    console.log("PASS");
  } else {
    console.error("FAIL");
    process.exit(1);
  }
}

test();
