import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://api:123456@127.0.0.1:5432/api' });
const r = await pool.query('SELECT email, password FROM users WHERE email = ', ['admin@example.com']);
console.log(JSON.stringify(r.rows));
await pool.end();
