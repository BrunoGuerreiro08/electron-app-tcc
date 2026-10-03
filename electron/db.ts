import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'

// There is no single global `db` anymore — the active connection depends on
// which user is logged in. Everything below is scoped to `users/<userId>/`.
let db: Database.Database | null = null
let activeUserId: string | null = null

function getUserDbPath(userId: string): string {
  const dir = path.join(app.getPath('userData'), 'users', userId)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'portfolio.db')
}

/**
 * Opens (or reuses) the SQLite connection for the given user.
 * Closes any previously open connection first — only one user's db is ever
 * open at a time, which is the isolation invariant IPC handlers rely on.
 */
export function openUserDb(userId: string): Database.Database {
  if (db && activeUserId === userId) return db
  if (db) closeUserDb()

  const dbPath = getUserDbPath(userId)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  activeUserId = userId
  return db
}

export function closeUserDb(): void {
  if (db) {
    db.close()
    db = null
    activeUserId = null
  }
}

/**
 * Returns the currently open db. Throws if no user is logged in — this is
 * intentional: it's a loud signal that an IPC handler ran before/after a
 * valid session, rather than silently touching the wrong user's data (or
 * worse, a stale handle to a previous user's closed connection).
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('No active user database — call openUserDb() after login first.')
  }
  return db
}

export function getActiveUserId(): string | null {
  return activeUserId
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- New level between Collection and SubGroup. Mirrors the same
    -- min/max/bonus_rate shape subgroups briefly carried (see migration
    -- below) — but this is now their real home: a group-spanning
    -- threshold/bonus needs to sit ABOVE the subgroups it spans, not on
    -- one of them standing in for the whole group.
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      min_points REAL,
      max_points REAL,
      bonus_rate REAL
    );

    -- group_id is nullable at the SQL level (SQLite can't retroactively
    -- add a NOT NULL constraint without a full table rebuild, which felt
    -- too risky to do automatically on someone's real data mid-project).
    -- The hierarchy is mandatory in practice: every subgroup gets a
    -- group_id via the migration below on first launch after this
    -- change, and every code path that creates a subgroup going forward
    -- must supply one — group_id should be treated as required
    -- everywhere in TypeScript (see Subgroup in entities.ts), this
    -- nullability is purely a SQLite migration accommodation.
    --
    -- collection_id is KEPT even though it's now reachable via
    -- group_id -> groups.collection_id — dropping it risks breaking
    -- existing queries in subgroups.ts I haven't seen. Redundant but
    -- harmless; worth revisiting once that file's actual queries are
    -- visible.
    CREATE TABLE IF NOT EXISTS subgroups (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      min_points REAL,
      max_points REAL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      subgroup_id TEXT NOT NULL REFERENCES subgroups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rule TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    -- Global document pool. Not owned by any collection/category directly.
    -- created_at = when logged into the app; issued_at = date on the document.
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      issuer TEXT,
      issued_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      quantity REAL NOT NULL DEFAULT 1,
      hours REAL,
      notes TEXT,
      file_path TEXT,
      file_status TEXT NOT NULL DEFAULT 'pending',
      file_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, tag_id)
    );

    -- The core decoupling: M:N between documents and categories.
    -- Deleting a category/collection cascades here (unlinks) but never
    -- touches the document row or its file.
    CREATE TABLE IF NOT EXISTS document_category_links (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      linked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (document_id, category_id)
    );
  `)

  // --- Schema migrations for databases created before groups existed ---
  // SQLite has no "ADD COLUMN IF NOT EXISTS" / "DROP COLUMN IF EXISTS",
  // so each of these just tries the ALTER and swallows the error once
  // it's already been applied on a previous launch.

  try {
    db.exec(`ALTER TABLE subgroups ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE`)
  } catch {
    // column already exists — nothing to do
  }

  try {
    // bonus_rate briefly lived on subgroups (see git history) as a
    // workaround before groups existed — now lives on groups instead.
    db.exec(`ALTER TABLE subgroups DROP COLUMN bonus_rate`)
  } catch {
    // column already dropped, or this DB never had it — nothing to do
  }

  try {
    // Content hash (sha256, hex) of a document's attached file — lets a
    // template-apply import recognize "this is the same file I already
    // have" instead of creating a duplicate. Backfilled lazily (see
    // getOrBackfillHash in fileHandler.ts) rather than eagerly for every
    // pre-existing document on launch.
    db.exec(`ALTER TABLE documents ADD COLUMN file_hash TEXT`)
  } catch {
    // column already exists — nothing to do
  }

  // --- Data migration: backfill a default "Geral" group for every
  // collection whose subgroups predate this change. Mirrors the existing
  // "default General sub-group" pattern for categories (NFR-02-03), one
  // level up. Idempotent: only touches subgroups still missing a
  // group_id, so it's a no-op on every launch after the first.
  const orphanCollections = db
    .prepare(`SELECT DISTINCT collection_id FROM subgroups WHERE group_id IS NULL`)
    .all() as { collection_id: string }[]

  if (orphanCollections.length > 0) {
    const createGroup = db.prepare(
      `INSERT INTO groups (id, collection_id, name, display_order) VALUES (?, ?, 'Geral', 0)`
    )
    const backfillSubgroups = db.prepare(
      `UPDATE subgroups SET group_id = ? WHERE collection_id = ? AND group_id IS NULL`
    )

    const migrate = db.transaction(() => {
      for (const { collection_id } of orphanCollections) {
        const groupId = randomUUID()
        createGroup.run(groupId, collection_id)
        backfillSubgroups.run(groupId, collection_id)
      }
    })
    migrate()
  }
}