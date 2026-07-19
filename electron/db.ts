import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

const dbPath = path.join(app.getPath('userData'), 'portfolio.db')

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initSchema() {
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