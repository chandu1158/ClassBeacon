import pool from './db/db.js';
import fs from 'fs';

async function exportCredentials() {
  const [users] = await pool.query(
    "SELECT user_id, email, full_name, role, phone FROM users ORDER BY FIELD(role, 'admin', 'staff', 'student'), user_id ASC"
  );

  let md = '| User ID / Roll No | Full Name | Role | Email | Phone Number | Password |\n|---|---|---|---|---|---|\n';
  for (const u of users) {
    const pwd = u.role === 'admin' ? 'Admin@123' : '12345';
    md += `| \`${u.user_id}\` | ${u.full_name} | **${u.role.toUpperCase()}** | ${u.email} | ${u.phone || 'N/A'} | \`${pwd}\` |\n`;
  }

  fs.writeFileSync('../credentials_table.md', md, 'utf-8');
  console.log(`Generated ../credentials_table.md with ${users.length} accounts.`);
  process.exit(0);
}

exportCredentials();
