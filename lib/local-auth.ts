import 'server-only';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { sql } from './local-db';

const scrypt = promisify(scryptCallback);
const COOKIE = 'nucel_session';
const SESSION_DAYS = 30;

export type LocalMember = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'collaborator';
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 1024) throw new Error('VALID:Senha invalida.');
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, Buffer.from(salt, 'hex'), 64) as Buffer;
  return 'scrypt$' + salt + '$' + hash.toString('hex');
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded || !encoded.startsWith('scrypt$')) return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await scrypt(password, Buffer.from(parts[1], 'hex'), expected.length) as Buffer;
  return timingSafeEqual(expected, actual);
}

async function putSession(memberId: string) {
  const token = randomBytes(32).toString('base64url');
  await sql('INSERT INTO nucel_sessions(token_hash, member_id, expires_at) VALUES ($1,$2,now()+interval \'30 days\')', [sha256(token), memberId]);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function getAuthenticatedUser(): Promise<LocalMember | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token || token.length > 256) return null;
  const rows = await sql<LocalMember>(
    `SELECT m.id,m.email,m.name,m.role
       FROM nucel_sessions s JOIN nucel_members m ON m.id=s.member_id
      WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,
    [sha256(token)],
  );
  return rows[0] || null;
}

async function recordFailedLogin(email: string) {
  await sql(`
    INSERT INTO nucel_login_attempts(email,attempts,first_attempt_at) VALUES ($1,1,now())
    ON CONFLICT (email) DO UPDATE
    SET attempts = CASE WHEN nucel_login_attempts.first_attempt_at < now()-interval '15 minutes'
                        THEN 1 ELSE nucel_login_attempts.attempts+1 END,
        first_attempt_at = CASE WHEN nucel_login_attempts.first_attempt_at < now()-interval '15 minutes'
                                THEN now() ELSE nucel_login_attempts.first_attempt_at END`, [email]);
}

export async function signInWithPassword(email: string, password: string) {
  const key = email.trim().toLowerCase();
  const attempts = await sql<{ attempts: number; first_attempt_at: Date }>(
    'SELECT attempts,first_attempt_at FROM nucel_login_attempts WHERE email=$1', [key]);
  if (attempts[0]?.attempts >= 10 && new Date(attempts[0].first_attempt_at).getTime() > Date.now() - 15 * 60_000) {
    throw new Error('AUTH:Muitas tentativas. Aguarde 15 minutos.');
  }
  const rows = await sql<LocalMember & { password_hash: string | null }>(
    'SELECT id,email,name,role,password_hash FROM nucel_members WHERE email=$1 LIMIT 1', [key]);
  const valid = await verifyPassword(password, rows[0]?.password_hash || null);
  if (!valid) {
    await recordFailedLogin(key);
    throw new Error('AUTH:E-mail ou senha invalidos.');
  }
  await sql('DELETE FROM nucel_login_attempts WHERE email=$1', [key]);
  await putSession(rows[0].id);
  return rows[0];
}

export async function registerWithInvitation(email: string, name: string, password: string, invite: string) {
  const key = email.trim().toLowerCase();
  const rows = await sql<{ id: string; invite_hash: string | null; password_hash: string | null }>(
    'SELECT id,invite_hash,password_hash FROM nucel_members WHERE email=$1 LIMIT 1', [key]);
  const member = rows[0];
  const inputHash = sha256(invite.trim());
  if (!member || !member.invite_hash || !/^[A-Za-z0-9_-]{20,128}$/.test(invite) ||
      !timingSafeEqual(Buffer.from(member.invite_hash,'hex'), Buffer.from(inputHash,'hex')) ||
      member.password_hash) {
    throw new Error('AUTH:Convite invalido ou ja utilizado.');
  }
  const digest = await hashPassword(password);
  const updated = await sql<{ id: string }>(
    `UPDATE nucel_members SET name=$1,password_hash=$2,invite_hash=NULL
       WHERE id=$3 AND invite_hash=$4 AND password_hash IS NULL RETURNING id`,
    [name, digest, member.id, member.invite_hash]);
  if (!updated[0]) throw new Error('AUTH:Convite ja utilizado.');
  await putSession(member.id);
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await sql('DELETE FROM nucel_sessions WHERE token_hash=$1', [sha256(token)]);
  store.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export function makeInvite() {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: sha256(token) };
}
