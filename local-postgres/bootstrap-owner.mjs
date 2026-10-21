// Execute no PC servidor: npm run local:owner
// Gera uma senha temporaria exibida uma unica vez no terminal local.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const owner = process.env.NUCEL_OWNER_EMAIL?.trim().toLowerCase();
if (!owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) {
  console.error('[ERRO] Configure NUCEL_OWNER_EMAIL no .env.local');
  process.exit(1);
}
const host = process.env.NUCEL_PG_HOST || '127.0.0.1';
if (!['127.0.0.1','localhost'].includes(host)) {
  console.error('[ERRO] PostgreSQL deve ficar somente em localhost.');
  process.exit(1);
}
const db = new pg.Client({
  host,
  port: Number(process.env.NUCEL_PG_PORT || 5432),
  database: process.env.NUCEL_PG_DB || 'nucel_db',
  user: process.env.NUCEL_PG_USER || 'nucel_app',
  password: process.env.NUCEL_PG_PASSWORD,
  connectionTimeoutMillis: 3000,
});
try {
  await db.connect();
  await db.query('BEGIN');
  await db.query(
    'INSERT INTO nucel_members(email,name,role) VALUES ($1,$2,$3) ON CONFLICT(email) DO NOTHING',
    [owner,'Administrador NuCel','admin'],
  );
  const row = await db.query(
    'SELECT id,role,password_hash FROM nucel_members WHERE email=$1 FOR UPDATE', [owner],
  );
  if (!row.rows[0] || row.rows[0].role !== 'admin') {
    throw new Error('A conta do e-mail principal ja existe com outro papel. Verifique manualmente.');
  }
  if (row.rows[0].password_hash) {
    await db.query('COMMIT');
    console.log('[OK] Administrador ja possui senha. Nenhuma alteracao.');
  } else {
    const password = crypto.randomBytes(20).toString('base64url');
    const salt = crypto.randomBytes(16);
    const digest = await scrypt(password,salt,64);
    const hash = 'scrypt$'+salt.toString('hex')+'$'+digest.toString('hex');
    await db.query('UPDATE nucel_members SET password_hash=$1 WHERE id=$2',[hash,row.rows[0].id]);
    await db.query('COMMIT');
    console.log('\n[OK] Administrador criado. Guarde esta senha em local seguro:');
    console.log('LOGIN:',owner);
    console.log('SENHA TEMPORARIA:',password);
    console.log('\nA senha so aparece nesta execucao. Nao envie prints com ela.');
  }
} catch (error) {
  try { await db.query('ROLLBACK'); } catch {}
  console.error('[ERRO] Falha ao configurar administrador:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
