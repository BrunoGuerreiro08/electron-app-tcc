import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

/**
 * Server-side schema, per project-context.md's data model:
 *   User -> Session (one or more, one per device)
 *   SyncLog is stubbed here for the future sync feature — not used by auth yet.
 * Standard SQL only, no Postgres-specific extensions beyond gen_random_uuid()
 * (available via pgcrypto, which ships enabled by default on modern Postgres).
 */
export async function initSchema() {
    await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,
      entity_id UUID NOT NULL,
      operation TEXT NOT NULL,
      payload JSONB NOT NULL,
      synced_at TIMESTAMPTZ
    );
  `)
}

export async function findOrCreateUser(email: string): Promise<string> {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows[0]) return existing.rows[0].id

    const created = await pool.query(
        'INSERT INTO users (email) VALUES ($1) RETURNING id',
        [email]
    )
    return created.rows[0].id
}

export async function createSession(userId: string, token: string, expiresAt: Date) {
    await pool.query(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
    )
}