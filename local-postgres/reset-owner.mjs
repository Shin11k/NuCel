// Execute SOMENTE no PowerShell do PC servidor: npm.cmd run local:reset-owner
// Gera uma nova senha forte para o admin sem excluir membros, grants nem dispositivos.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const owner = process.env.NUCEL_OWNER_EMAIL?.trim().toLowerCase();
const host = process.env.NUCEL_PG_HOST || '127.0.0.1';

if (!owner || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(owner)) {
  console.error('[ERRO] NUCEL_OWNER_EMAIL invalido em .env.local');
  process.exit(1);
}
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error('[ERRO] So e permitido redefinir pelo PostgreSQL local.');
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

let inTransaction = false;
try {
  await db.connect();
  await db.query('BEGIN');
  inTransaction = true;
  const found = await db.query(
    'SELECT id FROM nucel_members WHERE email=$1 AND role=$2 FOR UPDATE',
    [owner, 'admin'],
  );
  if (!found.rows[0]) throw new Error('Administrador configurado nao encontrado; nenhuma alteracao feita.');

  const newPassword = crypto.randomBytes(24).toString('base64url');
  const salt = crypto.randomBytes(16);
  const digest = await scrypt(newPassword, salt, 64);
  const hash = 'scrypt$' + salt.toString('hex') + '$' + digest.toString('hex');

  await db.query('UPDATE nucel_members SET password_hash=$1 WHERE id=$2',
    [hash, found.rows[0].id]);
  await db.query('DELETE FROM nucel_sessions WHERE member_id=$1', [found.rows[0].id]);
  await db.query('DELETE FROM nucel_login_attempts WHERE email=$1', [owner]);

  await db.query('COMMIT');
  inTransaction = false;
  console.log('\n[OK] Senha redefinida. As sessoes anteriores do administrador foram invalidadas.');
  console.log('LOGIN:', owner);
  console.log('SENHA NOVA (exibida somente agora):', newPassword);
  console.log('\nGuarde a senha em um gerenciador. Nao envie prints com a senha.');
} catch (error) {
  if (inTransaction) { try { await db.query('ROLLBACK'); } catch {} }
  console.error('[ERRO] Nao foi possivel redefinir:', error.message);
  process.exitCode = 1;
} finally {
  try { await db.end(); } catch {}
}
