import {
  generateEncryptionKeyPair,
  encryptKeyForDevice,
  decryptKeyForDevice,
  generateNoteKey,
} from "./src/lib/crypto.ts";

async function testCrypto() {
  console.log("=== Crypto Verification Start ===");

  // 1. Generate Identity (User B)
  console.log("1. Generating User B keys...");
  const userB = await generateEncryptionKeyPair();
  console.log("   User B Public: ", userB.publicKey);
  console.log("   User B Private:", userB.privateKey);

  // 2. Generate Note Key (Server A)
  console.log("\n2. Generating Note Key...");
  const noteKey = generateNoteKey();
  console.log("   Note Key (Original):", noteKey);
  console.log("   Note Key Length:    ", noteKey.length);

  // 3. Encrypt for User B (Server A action)
  console.log("\n3. Encrypting for User B...");
  try {
    const envelope = encryptKeyForDevice(noteKey, userB.publicKey);
    console.log("   Envelope:       ", envelope);
    console.log("   Envelope Length:", envelope.length);

    // 4. Decrypt as User B (Client B action)
    console.log("\n4. Decrypting as User B...");
    const decryptedKey = decryptKeyForDevice(envelope, userB.privateKey);
    console.log("   Decrypted Key:  ", decryptedKey);

    if (decryptedKey === noteKey) {
      console.log("\n✅ SUCCESS: Keys match!");
    } else {
      console.error("\n❌ FAILURE: Keys do not match!");
      console.error("Expected:", noteKey);
      console.error("Got:     ", decryptedKey);
    }
  } catch (e) {
    console.error("\n❌ CRITICAL ERROR:", e);
  }
}

testCrypto();
