import mysql from "mysql2/promise";

const email = "mikolajmadziag@gmail.com";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// TIMESTAMP max is 2038-01-19 — use 2037-12-31 as "permanent" expiry
// Update role to admin and plan to business
await conn.query(
  "UPDATE users SET role = 'admin', plan = 'business', planExpiresAt = '2037-12-31 23:59:59' WHERE email = ?",
  [email]
);

const [rows] = await conn.query(
  "SELECT id, name, email, role, plan, planExpiresAt FROM users WHERE email = ?",
  [email]
);

console.log("✅ Updated user:", JSON.stringify(rows[0], null, 2));
await conn.end();
