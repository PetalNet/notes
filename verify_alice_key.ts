import { decryptKeyForDevice } from "./src/lib/crypto.ts";

async function verifyAliceKey() {
  const alicePriv = "8yxKreQsh2I8gQiL4GsHQQs4LSJGlOVVDETkIU6NB2c=";
  const noteKeyEnc =
    "c1i1h1NO8WN3buoPWrmY++GQFulEtokhhNnJshR/ygNwiNo96p/spl3lJKJt42D6LeeaBEBjdM1Ioq3iJ3kzLXhKX8kNYOll1KMkAJCoUiRbr6HG2+DCEd1xeT6fixowjKc8BCXeTfc=";

  console.log("=== Verifying Alice's Decryption ===");
  try {
    const raw = decryptKeyForDevice(noteKeyEnc, alicePriv);
    console.log("✅ SUCCESS!");
    console.log("Raw Key:", raw);
    console.log("Length:", raw.length); // Should be 44
  } catch (e) {
    console.error("❌ FAILED:", e);
  }
}

verifyAliceKey();
