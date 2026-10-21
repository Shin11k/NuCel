import pg from 'pg';

const host = process.env.NUCEL_PG_HOST || '127.0.0.1';
if (!['127.0.0.1','localhost'].includes(host)) {
  console.error('[ERRO] Use PostgreSQL local: NUCEL_PG_HOST=127.0.0.1');
  process.exit(1);
}
const db = new pg.Client({
  host,
  port: Number(process.env.NUCEL_PG_PORT || 5432),
  database: process.env.NUCEL_PG_DB || 'nucel_db',
  user: process.env.NUCEL_PG_USER || 'nucel_app',
  password: process.env.NUCEL_PG_PASSWORD,
  connectionTimeoutMillis: 3000,
  statement_timeout: 5000,
});
try {
  await db.connect();
  const tables = ['nucel_members','nucel_bridges','nucel_devices','nucel_grants','nucel_sessions','nucel_login_attempts'];
  for (const name of tables) {
    const res = await db.query('SELECT to_regclass($1) AS t', [name]);
    if (!res.rows[0]?.t) throw Error('Tabela ausente: ' + name);
  }
  const stats = await db.query(
    'SELECT (SELECT count(*)::int FROM nucel_members) AS members, ' +
    '(SELECT count(*)::int FROM nucel_devices) AS devices, ' +
    '(SELECT count(*)::int FROM nucel_bridges) AS bridges',
  );
  console.log('[OK] PostgreSQL local online e estrutura valida.');
  console.log('[OK] Dados:', stats.rows[0]);
  console.log('[OK] Banco acessivel apenas via aplicacao, nunca pela internet direta.');
} catch (error) {
  console.error('[ERRO] PostgreSQL:', error.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(()=>{});
}
