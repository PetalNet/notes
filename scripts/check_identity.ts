import { fetchUserIdentity } from "../src/lib/server/federation.ts";

console.log("=== Identity Fetch Verification ===");
const handle = "@bob:localhost:5174";
const requestingDomain = "localhost:5173";

try {
  console.log(`Fetching identity for ${handle} from ${requestingDomain}...`);
  const identity = await fetchUserIdentity(handle, requestingDomain);

  console.log("Result:");
  console.log(JSON.stringify(identity, null, 2));

  if (identity?.publicKey) {
    console.log(
      "\nPublic Key First 10 chars:",
      identity.publicKey.slice(0, 10),
    );
  } else {
    console.log("\n❌ No Public Key found!");
  }
} catch (e) {
  console.error("❌ Error fetching identity:", e);
}
