import type Database from 'better-sqlite3'
import { createLogger } from '../logger'

const log = createLogger('db-schema')

const CURRENT_VERSION = 1

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  added_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_state (
  project_id          TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'sleeping',
  current_iteration   TEXT,
  next_wake_time      TEXT,
  wake_schedule       TEXT NOT NULL DEFAULT '{"mode":"manual","intervalMinutes":null,"times":[]}',
  total_tokens        INTEGER NOT NULL DEFAULT 0,
  total_cost          REAL NOT NULL DEFAULT 0,
  rate_limit_reset_at TEXT
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'idea',
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',
  status       TEXT NOT NULL DEFAULT 'pending',
  milestone_id TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'draft',
  acceptance_criteria  TEXT NOT NULL DEFAULT '[]',
  tasks                TEXT NOT NULL DEFAULT '[]',
  inbox_item_ids       TEXT NOT NULL DEFAULT '[]',
  review               TEXT,
  created_at           TEXT NOT NULL,
  completed_at         TEXT,
  iteration_count      INTEGER NOT NULL DEFAULT 0,
  base_commit          TEXT
);

CREATE TABLE IF NOT EXISTS iterations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id          TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  round                 INTEGER NOT NULL,
  developer_session_id  TEXT,
  acceptor_session_id   TEXT,
  outcome               TEXT,
  started_at            TEXT,
  completed_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbox_project ON inbox_items(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(project_id, status);
CREATE INDEX IF NOT EXISTS idx_iterations_milestone ON iterations(milestone_id);
`

export function initSchema(db: Database.Database): void {
  const version = getSchemaVersion(db)
  if (version >= CURRENT_VERSION) {
    log.info('schema up to date', { version })
    return
  }

  log.info('initializing schema', { from: version, to: CURRENT_VERSION })
  db.exec(SCHEMA_SQL)

  if (version === 0) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_VERSION)
  } else {
    db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_VERSION)
  }

  log.info('schema initialized', { version: CURRENT_VERSION })
}

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get() as
      | { name: string }
      | undefined
    if (!row) return 0
    const ver = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
    return ver?.version ?? 0
  } catch {
    return 0
  }
}
