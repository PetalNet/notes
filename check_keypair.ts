import { Database } from "bun:sqlite"; // or better, just use drizzle or direct sqlite driver if available
// Actually, I can rely on the app's db module if I run with vite-node
import { db } from "./src/lib/server/db/index.ts";
import { users } from "./src/lib/server/db/schema.ts";
import { eq } from "drizzle-orm";
import {
  encryptKeyForDevice,
  decryptKeyForDevice,
  generateNoteKey,
} from "./src/lib/crypto.ts";

async function checkKeys() {
  console.log("=== Keypair Consistency Check ===");

  // 1. Get Bob's keys
  const bob = await db.query.users.findFirst({
    where: eq(users.username, "bob"),
  });

  if (!bob) {
    console.error("❌ Bob not found in DB!");
    return;
  }

  console.log("Bob:", bob.id);
  console.log("Public Key: ", bob.publicKey);
  console.log("Private Key:", bob.privateKeyEncrypted);

  if (!bob.publicKey || !bob.privateKeyEncrypted) {
    console.error("❌ Missing keys!");
    return;
  }

  // 2. Test Keypair
  const secret = generateNoteKey();
  console.log("\nTest Secret:", secret);

  try {
    // Encrypt to Bob's Public Key
    const envelope = encryptKeyForDevice(secret, bob.publicKey);
    console.log("Encrypted Envelope:", envelope);

    // Decrypt with Bob's Private Key
    const decrypted = decryptKeyForDevice(envelope, bob.privateKeyEncrypted);
    console.log("Decrypted Secret:  ", decrypted);

    if (decrypted === secret) {
      console.log("\n✅ SUCCESS: Stored keys are a valid pair!");
    } else {
      console.error("\n❌ FAILURE: Decrypted secret does not match!");
    }
  } catch (e) {
    console.error("\n❌ CRITICAL ERROR during test:", e);
  }
}

checkKeys();
