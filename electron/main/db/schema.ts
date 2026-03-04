import type Database from 'better-sqlite3'
import { createLogger } from '../logger'

const log = createLogger('db-schema')

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id                  TEXT PRIMARY KEY,
  path                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  added_at            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'sleeping',
  current_iteration   TEXT,
  next_wake_time      TEXT,
  wake_schedule       TEXT NOT NULL DEFAULT '{"mode":"manual","intervalMinutes":null,"times":[]}',
  rate_limit_reset_at TEXT
);

CREATE TABLE IF NOT EXISTS backlog_items (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'idea',
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',
  status       TEXT NOT NULL DEFAULT 'todo',
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
  completed_at          TEXT,
  total_tokens          INTEGER NOT NULL DEFAULT 0,
  total_cost            REAL NOT NULL DEFAULT 0,
  model                 TEXT
);

CREATE TABLE IF NOT EXISTS milestone_comments (
  id              TEXT PRIMARY KEY,
  milestone_id    TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  author          TEXT NOT NULL DEFAULT 'human',
  path            TEXT,
  line            INTEGER,
  start_line      INTEGER,
  commit_id       TEXT,
  in_reply_to_id  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_project ON backlog_items(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(project_id, status);
CREATE INDEX IF NOT EXISTS idx_iterations_milestone ON iterations(milestone_id);
CREATE INDEX IF NOT EXISTS idx_comments_milestone ON milestone_comments(milestone_id);
`

function migrateIterationUsageColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(iterations)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (colNames.has('total_tokens')) return

  log.info('migrating iterations table: adding usage columns')
  db.exec(`
    ALTER TABLE iterations ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE iterations ADD COLUMN total_cost REAL NOT NULL DEFAULT 0;
    ALTER TABLE iterations ADD COLUMN model TEXT;
  `)
}

function migrateAutoMergeColumn(db: Database.Database): void {
  const cols = db.pragma('table_info(projects)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (colNames.has('auto_merge')) return

  log.info('migrating projects table: adding auto_merge column')
  db.exec(`ALTER TABLE projects ADD COLUMN auto_merge INTEGER NOT NULL DEFAULT 0;`)
}

function migrateMilestoneCommentsTable(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milestone_comments'").all()
  if (tables.length > 0) return

  log.info('migrating: creating milestone_comments table')
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_comments (
      id              TEXT PRIMARY KEY,
      milestone_id    TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      body            TEXT NOT NULL,
      author          TEXT NOT NULL DEFAULT 'human',
      path            TEXT,
      line            INTEGER,
      start_line      INTEGER,
      commit_id       TEXT,
      in_reply_to_id  TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_milestone ON milestone_comments(milestone_id);
  `)
}

function migrateInboxToBacklog(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_items'").all()
  if (tables.length === 0) return

  log.info('migrating: renaming inbox_items → backlog_items')
  db.exec(`
    ALTER TABLE inbox_items RENAME TO backlog_items;
    DROP INDEX IF EXISTS idx_inbox_project;
    CREATE INDEX IF NOT EXISTS idx_backlog_project ON backlog_items(project_id);
  `)
}

function migrateBacklogStatusToKanban(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='backlog_items'").all()
  if (tables.length === 0) return

  // Check if any rows still use old statuses
  const oldRows = db.prepare("SELECT COUNT(*) as cnt FROM backlog_items WHERE status IN ('pending', 'included', 'dismissed')").get() as { cnt: number }
  if (oldRows.cnt === 0) return

  log.info('migrating backlog_items status: pending→todo, included→in_progress, dismissed→closed')
  db.exec(`
    UPDATE backlog_items SET status = 'todo' WHERE status = 'pending';
    UPDATE backlog_items SET status = 'in_progress' WHERE status = 'included';
    UPDATE backlog_items SET status = 'closed' WHERE status = 'dismissed';
  `)
}

export function initSchema(db: Database.Database): void {
  log.info('initializing schema')
  db.exec(SCHEMA_SQL)
  migrateIterationUsageColumns(db)
  migrateAutoMergeColumn(db)
  migrateMilestoneCommentsTable(db)
  migrateInboxToBacklog(db)
  migrateBacklogStatusToKanban(db)
}
