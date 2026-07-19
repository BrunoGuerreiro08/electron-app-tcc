import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export interface UserRecord {
  id: string
  email: string
  name: string | null
}

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
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- idempotent migration for containers created before "name" existed
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

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

/**
 * Finds a user by email, or creates one. Reports whether the user was
 * just created so the client can trigger first-time onboarding
 * (asking for a display name) before treating the session as complete.
 */
export async function findOrCreateUser(
  email: string
): Promise<{ user: UserRecord; isNew: boolean }> {
  const existing = await pool.query<UserRecord>(
    'SELECT id, email, name FROM users WHERE email = $1',
    [email]
  )
  if (existing.rows[0]) {
    return { user: existing.rows[0], isNew: false }
  }

  const created = await pool.query<UserRecord>(
    'INSERT INTO users (email) VALUES ($1) RETURNING id, email, name',
    [email]
  )
  return { user: created.rows[0], isNew: true }
}

export async function updateUserName(userId: string, name: string): Promise<UserRecord> {
  const result = await pool.query<UserRecord>(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name',
    [name, userId]
  )
  return result.rows[0]
}

/**
 * Resolves a bearer token to its owning user, only if the session
 * hasn't expired. Used by the auth middleware to protect routes that
 * require an established identity (e.g. completing onboarding).
 */
export async function getSessionUser(token: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT u.id, u.email, u.name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  )
  return result.rows[0] ?? null
}

export async function createSession(userId: string, token: string, expiresAt: Date) {
  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  )
}