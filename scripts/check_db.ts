import { createClient } from "@libsql/client";

const dbPath = process.env.DATABASE_URL || "file:local.db";
console.log(`Checking database: ${dbPath}`);

const client = createClient({
  url: dbPath,
});

async function main() {
  try {
    const result = await client.execute("PRAGMA table_info(users);");
    console.log("Users table columns:");
    result.rows.forEach((row) => {
      console.log(`- ${row.name} (${row.type})`);
    });

    const count = await client.execute("SELECT count(*) as count FROM users;");
    console.log(`User count: ${count.rows[0].count}`);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
