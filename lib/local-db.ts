import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('CONFIG:' + name);
  return value;
}

// PostgreSQL fica sempre no mesmo PC que executa o Next.js.
// Nunca configure port-forward da porta 5432 no roteador.
function makePool() {
  const host = process.env.NUCEL_PG_HOST?.trim() || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('CONFIG:NUCEL_PG_HOST deve ser localhost');
  }
  return new Pool({
    host,
    port: Number(process.env.NUCEL_PG_PORT || 5432),
    database: process.env.NUCEL_PG_DB?.trim() || 'nucel_db',
    user: process.env.NUCEL_PG_USER?.trim() || 'nucel_app',
    password: required('NUCEL_PG_PASSWORD'),
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    ssl: false,
  });
}

// Evita criar pools duplicados com o hot-reload no desenvolvimento.
const cached = globalThis as typeof globalThis & { __nucelLocalPool?: Pool };
export const pool = cached.__nucelLocalPool ?? makePool();
if (process.env.NODE_ENV !== 'production') cached.__nucelLocalPool = pool;

export async function sql<T extends QueryResultRow = QueryResultRow>(
  statement: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(statement, [...params]);
  return result.rows;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
