import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

// The new password to set
const NEW_PASSWORD = 'admin123';
const TARGET_EMAIL = 'admin@example.com';

const pool = new Pool({ connectionString: 'postgresql://api:123456@127.0.0.1:5432/api' });

async function main() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  console.log('Generated hash for', NEW_PASSWORD, ':', hash);
  const result = await pool.query(
    'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, email',
    [hash, TARGET_EMAIL]
  );
  if (result.rows.length === 0) {
    console.log('User not found!');
  } else {
    console.log('Password updated for:', result.rows[0]);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
