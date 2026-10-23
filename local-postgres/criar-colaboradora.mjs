// Executar SOMENTE no PowerShell do servidor NuCel (pasta raiz do projeto).
// node --env-file=.env.local local-postgres/criar-colaboradora.mjs email@exemplo.com "Nome"
// Gera uma senha inicial forte e mostra somente neste terminal.
// Nao altera administrador, dispositivos, grants ou outros colaboradores.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const email = (process.argv[2] || '').trim().toLowerCase();
const name = (process.argv.slice(3).join(' ') || '').trim();
const ownerEmail = (process.env.NUCEL_OWNER_EMAIL || '').trim().toLowerCase();
const host = process.env.NUCEL_PG_HOST || '127.0.0.1';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
    !name || name.length > 100) {
  console.error('[ERRO] Uso: node --env-file=.env.local local-postgres/criar-colaboradora.mjs email@exemplo.com "Nome da pessoa"');
  process.exit(1);
}
if (email === ownerEmail) {
  console.error('[ERRO] Conta administradora nao pode ser modificada por este comando.');
  process.exit(1);
}
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error('[ERRO] Operacao restrita ao PostgreSQL local.');
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

  const existing = await db.query(
    'SELECT id,role FROM nucel_members WHERE email=$1 FOR UPDATE', [email]);
  if (existing.rows.length && existing.rows[0].role !== 'collaborator') {
    throw new Error('Este e-mail ja pertence a um administrador. Nenhuma alteracao.');
  }

  const password = crypto.randomBytes(24).toString('base64url');
  const salt = crypto.randomBytes(16);
  const hashBytes = await scrypt(password, salt, 64);
  const hash = 'scrypt$' + salt.toString('hex') + '$' + hashBytes.toString('hex');

  const member = await db.query(
    `INSERT INTO nucel_members(email,name,role,password_hash,invite_hash)
     VALUES($1,$2,'collaborator',$3,NULL)
     ON CONFLICT(email) DO UPDATE SET
       name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, invite_hash=NULL
     WHERE nucel_members.role='collaborator'
     RETURNING id`,
    [email, name, hash],
  );
  if (!member.rows[0]) throw new Error('Nao foi possivel criar a colaboradora.');

  // Se ja existia a conta, as sessoes anteriores e tentativas falhas sao invalidadas.
  await db.query('DELETE FROM nucel_sessions WHERE member_id=$1', [member.rows[0].id]);
  await db.query('DELETE FROM nucel_login_attempts WHERE email=$1', [email]);
  await db.query('COMMIT');
  inTransaction = false;

  console.log('\n[OK] Colaboradora pronta no NuCel.');
  console.log('PERFIL: colaboradora (sem acesso de administrador)');
  console.log('E-MAIL:', email);
  console.log('SENHA INICIAL:', password);
  console.log('ACESSO A CELULARES: mantido se a conta ja existia; caso contrario, libere pelo painel.');
  console.log('\nIMPORTANTE: copie a senha em particular. NAO envie prints com ela.');
  console.log('A camada Cloudflare Access ainda deve autorizar este e-mail separadamente.');
} catch (error) {
  if (inTransaction) { try { await db.query('ROLLBACK'); } catch {} }
  console.error('[ERRO] Conta nao configurada:', error.message);
  process.exitCode = 1;
} finally {
  try { await db.end(); } catch {}
}
