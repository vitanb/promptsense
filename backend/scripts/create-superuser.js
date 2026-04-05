#!/usr/bin/env node
/**
 * Create or promote an existing user to superuser.
 *
 * Usage:
 *   SUPERUSER_EMAIL=admin@example.com SUPERUSER_PASSWORD=Secret123! node scripts/create-superuser.js
 *
 * If the email already exists the user will be promoted to superuser without
 * changing their password.  If it doesn't exist a new account is created.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt  = require('bcryptjs');
const { query, pool } = require('../src/db/pool');

async function main() {
  const email    = process.env.SUPERUSER_EMAIL    || 'admin@promptsense.io';
  const password = process.env.SUPERUSER_PASSWORD || 'ChangeMe123!';
  const name     = process.env.SUPERUSER_NAME     || 'Super Admin';

  console.log(`\n🔑  PromptSense — create-superuser\n`);
  console.log(`   Email   : ${email}`);

  const { rows: [existing] } = await query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);

  if (existing) {
    await query('UPDATE users SET is_superuser = true WHERE id = $1', [existing.id]);
    console.log(`   Status  : existing user promoted to superuser ✓\n`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (email, password_hash, full_name, email_verified, is_superuser)
       VALUES ($1, $2, $3, true, true)`,
      [email.toLowerCase(), hash, name]
    );
    console.log(`   Status  : new superuser created ✓`);
    console.log(`   Password: ${password}`);
    console.log(`   ⚠️  Change this password immediately after first login!\n`);
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
