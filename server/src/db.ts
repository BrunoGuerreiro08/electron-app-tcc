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
 *   User -> mirrored app data + SyncLog (see initSyncSchema)
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

  `)
  await initSyncSchema()
}

/**
 * Sync storage: a mirror of the app's local tables (electron/db.ts), each
 * row owned by a user, plus the ordered log other devices pull from.
 * Ids stay TEXT so they round-trip exactly as the app generated them;
 * every key is (user_id, id) so two users can never touch each other's rows.
 * FKs cascade exactly like the local schema, so deleting a root row here
 * removes its subtree the same way it does on the device.
 */
async function initSyncSchema() {
  // The original sync_log was an unused stub with another shape — replace it.
  const stub = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_log' AND column_name = 'synced_at'`
  )
  if (stub.rowCount) await pool.query('DROP TABLE sync_log')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      user_id UUID NOT NULL,
      id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      min_points DOUBLE PRECISION,
      max_points DOUBLE PRECISION,
      bonus_rate DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id, collection_id) REFERENCES collections(user_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subgroups (
      user_id UUID NOT NULL,
      id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      min_points DOUBLE PRECISION,
      max_points DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id, collection_id) REFERENCES collections(user_id, id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, group_id) REFERENCES groups(user_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      user_id UUID NOT NULL,
      id TEXT NOT NULL,
      subgroup_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rule JSONB NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id, subgroup_id) REFERENCES subgroups(user_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      issuer TEXT,
      issued_at TEXT,
      created_at TEXT,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
      hours DOUBLE PRECISION,
      notes TEXT,
      file_hash TEXT,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, id),
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      user_id UUID NOT NULL,
      document_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, document_id, tag_id),
      FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, tag_id) REFERENCES tags(user_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_category_links (
      user_id UUID NOT NULL,
      document_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      linked_at TEXT,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, document_id, category_id),
      FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE CASCADE
    );

    -- Every applied change, in the order it was applied. seq is the cursor
    -- each device pulls from; op_id makes a retried push a no-op.
    CREATE TABLE IF NOT EXISTS sync_log (
      seq BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      op_id TEXT UNIQUE NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload JSONB NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sync_log_user_seq ON sync_log (user_id, seq);

    -- Collections a user stopped syncing: edits made before detached_at
    -- (by a device that hadn't heard yet) are rejected instead of applied.
    CREATE TABLE IF NOT EXISTS sync_detached (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL,
      detached_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, collection_id)
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

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'SELECT id, email, name FROM users WHERE email = $1',
    [email]
  )
  return result.rows[0] ?? null
}

/**
 * Throws the pg unique-violation error (code 23505) if another user already
 * owns `email` — callers map that to 409.
 */
export async function updateUserEmail(userId: string, email: string): Promise<UserRecord> {
  const result = await pool.query<UserRecord>(
    'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, email, name',
    [email, userId]
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

export interface SessionLookup {
  user: UserRecord
  expiresAt: Date
}

/**
 * Like getSessionUser, but also finds expired sessions — the refresh
 * endpoint needs to tell "expired" (renewable) apart from "unknown or
 * revoked" (needs a new OTP login).
 */
export async function findSessionByToken(token: string): Promise<SessionLookup | null> {
  const result = await pool.query<UserRecord & { expires_at: Date }>(
    `SELECT u.id, u.email, u.name, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  )
  const row = result.rows[0]
  if (!row) return null
  return { user: { id: row.id, email: row.email, name: row.name }, expiresAt: row.expires_at }
}

export async function extendSession(token: string, expiresAt: Date): Promise<void> {
  await pool.query('UPDATE sessions SET expires_at = $1 WHERE token = $2', [expiresAt, token])
}

/**
 * Replaces an expired token with a new one, atomically. Returns false if the
 * old token was already gone (revoked, or rotated by a concurrent call), so
 * an old token can never be redeemed twice.
 */
export async function rotateSession(
  oldToken: string,
  userId: string,
  newToken: string,
  expiresAt: Date
): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const deleted = await client.query('DELETE FROM sessions WHERE token = $1', [oldToken])
    if (deleted.rowCount === 0) {
      await client.query('ROLLBACK')
      return false
    }
    await client.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, newToken, expiresAt]
    )
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token = $1', [token])
}
