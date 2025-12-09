import {
  encryptKeyForDevice,
  decryptKeyForDevice,
  generateNoteKey,
} from "./src/lib/crypto.ts";

async function verifyKeys() {
  // I will replace these with values from the DB
  const publicKey = "ouOeCZu2NN+erXNttehhxtnIBwdFgkANhxkJtrwqNCg=";
  const privateKey = "H/UgylrpmcHHpYuhanuLDUOd/VAzWouh75xyEXUxLh8=";

  if (publicKey.includes("REPLACE")) {
    console.error("Please replace placeholder keys!");
    return;
  }

  console.log("=== Verifying Keys ===");
  console.log("Pub:", publicKey.slice(0, 10) + "...");

  const secret = generateNoteKey();
  try {
    const envelope = encryptKeyForDevice(secret, publicKey);
    const decrypted = decryptKeyForDevice(envelope, privateKey);

    if (decrypted === secret) {
      console.log("✅ SUCCESS: Keys work!");
    } else {
      console.error("❌ FAILURE: Decryption mismatch");
    }
  } catch (e) {
    console.error("❌ ERROR:", e);
  }
}

verifyKeys();
