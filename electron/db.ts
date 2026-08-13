import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
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

    CREATE TABLE IF NOT EXISTS subgroups (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
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
      file_status TEXT NOT NULL DEFAULT 'pending'
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
}