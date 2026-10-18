import { Pool, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool {
  if (globalForDb.pgPool) {
    return globalForDb.pgPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to your environment variables.");
  }

  const newPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 10,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pgPool = newPool;
  }

  return newPool;
}

// Reuse a single pool across hot reloads in development, initialized lazily.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const p = getPool();
    const val = (p as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(p) : val;
  },
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

