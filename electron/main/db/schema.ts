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
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'draft',
  created_at           TEXT NOT NULL,
  completed_at         TEXT,
  iteration_count      INTEGER NOT NULL DEFAULT 0,
  base_commit          TEXT
);

CREATE TABLE IF NOT EXISTS iterations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id          TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  round                 INTEGER NOT NULL,
  outcome               TEXT,
  started_at            TEXT,
  completed_at          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
  dispatch_count        INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS milestone_checks (
  id           TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  iteration    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_project ON backlog_items(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(project_id, status);
CREATE INDEX IF NOT EXISTS idx_iterations_milestone ON iterations(milestone_id);
CREATE INDEX IF NOT EXISTS idx_comments_milestone ON milestone_comments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_checks_item ON milestone_checks(item_id);

CREATE TABLE IF NOT EXISTS milestone_items (
  milestone_id  TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (milestone_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_milestone_items_item ON milestone_items(item_id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE SET NULL,
  agent_id     TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost   REAL NOT NULL DEFAULT 0,
  model        TEXT,
  status       TEXT NOT NULL DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_milestone ON agent_sessions(milestone_id);
CREATE INDEX IF NOT EXISTS idx_sessions_iteration ON agent_sessions(iteration_id);
`

function migrateIterationUsageColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(iterations)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  // Skip if columns already exist or if they've been removed by migrateDropIterationSessionColumns
  if (colNames.has('total_tokens') || !colNames.has('developer_session_id')) return

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

function migrateAutoApproveColumn(db: Database.Database): void {
  const cols = db.pragma('table_info(projects)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (colNames.has('auto_approve')) return

  log.info('migrating projects table: adding auto_approve column')
  db.exec(`ALTER TABLE projects ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0;`)
}

function migrateMilestoneDropJsonColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(milestones)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (!colNames.has('tasks') && !colNames.has('acceptance_criteria')) return

  log.info('migrating milestones table: dropping tasks and acceptance_criteria JSON columns')
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones_new (
      id                   TEXT PRIMARY KEY,
      project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title                TEXT NOT NULL,
      description          TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'draft',
      created_at           TEXT NOT NULL,
      completed_at         TEXT,
      iteration_count      INTEGER NOT NULL DEFAULT 0,
      base_commit          TEXT
    );
    INSERT INTO milestones_new SELECT id, project_id, title, description, status,
      created_at, completed_at, iteration_count, base_commit FROM milestones;
    DROP TABLE milestones;
    ALTER TABLE milestones_new RENAME TO milestones;
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(project_id, status);
  `)
}

function migrateMilestoneChecksTable(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milestone_checks'").all()
  if (tables.length > 0) return

  log.info('migrating: creating milestone_checks table')
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_checks (
      id           TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      iteration    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_checks_item ON milestone_checks(item_id);
    CREATE INDEX IF NOT EXISTS idx_checks_milestone ON milestone_checks(milestone_id);
  `)
}

function migrateMilestoneAssigneesColumn(db: Database.Database): void {
  const cols = db.pragma('table_info(milestones)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (colNames.has('assignees')) return

  log.info('migrating milestones table: adding assignees column')
  db.exec(`ALTER TABLE milestones ADD COLUMN assignees TEXT NOT NULL DEFAULT '[]';`)
}

function migrateMilestoneItemsTable(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milestone_items'").all()
  if (tables.length > 0) return

  log.info('migrating: creating milestone_items table + backfilling from backlog_items')
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_items (
      milestone_id  TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      item_id       TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL,
      PRIMARY KEY (milestone_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_milestone_items_item ON milestone_items(item_id);

    INSERT OR IGNORE INTO milestone_items (milestone_id, item_id, created_at)
    SELECT milestone_id, id, created_at FROM backlog_items WHERE milestone_id IS NOT NULL;
  `)
}

function migrateDropBacklogMilestoneId(db: Database.Database): void {
  const cols = db.pragma('table_info(backlog_items)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (!colNames.has('milestone_id')) return

  log.info('migrating backlog_items: dropping milestone_id column')
  db.exec(`
    CREATE TABLE IF NOT EXISTS backlog_items_new (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type         TEXT NOT NULL DEFAULT 'idea',
      title        TEXT NOT NULL,
      description  TEXT,
      priority     TEXT NOT NULL DEFAULT 'medium',
      status       TEXT NOT NULL DEFAULT 'todo',
      created_at   TEXT NOT NULL
    );
    INSERT INTO backlog_items_new SELECT id, project_id, type, title, description, priority, status, created_at FROM backlog_items;
    DROP TABLE backlog_items;
    ALTER TABLE backlog_items_new RENAME TO backlog_items;
    CREATE INDEX IF NOT EXISTS idx_backlog_project ON backlog_items(project_id);
  `)
}

function migrateMentionDispatchedColumn(db: Database.Database): void {
  const cols = db.pragma('table_info(milestone_comments)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (colNames.has('mention_dispatched')) return

  log.info('migrating milestone_comments table: adding mention_dispatched column')
  db.exec(`ALTER TABLE milestone_comments ADD COLUMN mention_dispatched INTEGER NOT NULL DEFAULT 0;`)
}

function migrateIterationStatusColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(iterations)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  // Skip if columns already exist or if the table has the new schema
  if (colNames.has('status') || !colNames.has('developer_session_id')) return

  log.info('migrating iterations table: adding status and dispatch_count columns')
  db.exec(`
    ALTER TABLE iterations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE iterations ADD COLUMN dispatch_count INTEGER NOT NULL DEFAULT 0;
  `)
}

function migrateChecksMilestoneIdColumn(db: Database.Database): void {
  const cols = db.pragma('table_info(milestone_checks)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))

  if (!colNames.has('milestone_id')) {
    log.info('migrating milestone_checks: adding milestone_id column and backfilling')
    db.exec(`
      CREATE TABLE IF NOT EXISTS milestone_checks_new (
        id           TEXT PRIMARY KEY,
        milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        item_id      TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        description  TEXT,
        status       TEXT NOT NULL DEFAULT 'pending',
        iteration    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      INSERT INTO milestone_checks_new (id, milestone_id, item_id, title, description, status, iteration, created_at, updated_at)
      SELECT mc.id, mi.milestone_id, mc.item_id, mc.title, mc.description, mc.status, mc.iteration, mc.created_at, mc.updated_at
      FROM milestone_checks mc
      JOIN milestone_items mi ON mi.item_id = mc.item_id;

      DROP TABLE milestone_checks;
      ALTER TABLE milestone_checks_new RENAME TO milestone_checks;
      CREATE INDEX IF NOT EXISTS idx_checks_item ON milestone_checks(item_id);
    `)
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_checks_milestone ON milestone_checks(milestone_id)')
}

function migrateAgentSessionsTable(db: Database.Database): void {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_sessions'").all()
  if (tables.length > 0) return

  log.info('migrating: creating agent_sessions table and backfilling from iterations')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
      iteration_id INTEGER REFERENCES iterations(id) ON DELETE SET NULL,
      agent_id     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      completed_at TEXT,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost   REAL NOT NULL DEFAULT 0,
      model        TEXT,
      status       TEXT NOT NULL DEFAULT 'running'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_milestone ON agent_sessions(milestone_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_iteration ON agent_sessions(iteration_id);
  `)

  // Backfill from existing iteration session columns
  const rows = db.prepare(`
    SELECT i.id as iteration_id, i.milestone_id, i.developer_session_id, i.acceptor_session_id,
           i.started_at, i.completed_at, i.total_tokens, i.total_cost, i.model,
           m.project_id
    FROM iterations i
    JOIN milestones m ON m.id = i.milestone_id
    WHERE i.developer_session_id IS NOT NULL OR i.acceptor_session_id IS NOT NULL
  `).all() as Array<{
    iteration_id: number; milestone_id: string; developer_session_id: string | null;
    acceptor_session_id: string | null; started_at: string | null; completed_at: string | null;
    total_tokens: number; total_cost: number; model: string | null; project_id: string;
  }>

  const insert = db.prepare(`
    INSERT OR IGNORE INTO agent_sessions (id, project_id, milestone_id, iteration_id, agent_id, started_at, completed_at, total_tokens, total_cost, model, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
  `)

  for (const row of rows) {
    const hasBoth = row.developer_session_id && row.acceptor_session_id
    // Split usage 60/40 between developer and acceptor when both exist
    const devRatio = hasBoth ? 0.6 : 1
    const accRatio = hasBoth ? 0.4 : 1

    if (row.developer_session_id) {
      insert.run(
        row.developer_session_id, row.project_id, row.milestone_id, row.iteration_id,
        'developer', row.started_at ?? new Date().toISOString(), row.completed_at,
        Math.round(row.total_tokens * devRatio), row.total_cost * devRatio, row.model
      )
    }
    if (row.acceptor_session_id) {
      insert.run(
        row.acceptor_session_id, row.project_id, row.milestone_id, row.iteration_id,
        'reviewer', row.started_at ?? new Date().toISOString(), row.completed_at,
        Math.round(row.total_tokens * accRatio), row.total_cost * accRatio, row.model
      )
    }
  }
}

function migrateDropIterationSessionColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(iterations)') as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (!colNames.has('developer_session_id')) return

  log.info('migrating iterations: dropping session/usage columns (moved to agent_sessions)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS iterations_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id    TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      round           INTEGER NOT NULL,
      outcome         TEXT,
      started_at      TEXT,
      completed_at    TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      dispatch_count  INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO iterations_new (id, milestone_id, round, outcome, started_at, completed_at, status, dispatch_count)
    SELECT id, milestone_id, round, outcome, started_at, completed_at,
           COALESCE(status, 'pending'), COALESCE(dispatch_count, 0) FROM iterations;
    DROP TABLE iterations;
    ALTER TABLE iterations_new RENAME TO iterations;
    CREATE INDEX IF NOT EXISTS idx_iterations_milestone ON iterations(milestone_id);
  `)
}

function migrateMilestoneStatusV3(db: Database.Database): void {
  const oldRows = db.prepare("SELECT COUNT(*) as cnt FROM milestones WHERE status IN ('reviewing', 'reviewed', 'in-progress', 'awaiting_review')").get() as { cnt: number }
  if (oldRows.cnt === 0) return

  log.info('migrating milestone statuses: reviewing→planning, reviewed→planned, in-progress→in_progress, awaiting_review→in_review')
  db.exec(`
    UPDATE milestones SET status = 'planning' WHERE status = 'reviewing';
    UPDATE milestones SET status = 'planned' WHERE status = 'reviewed';
    UPDATE milestones SET status = 'in_progress' WHERE status = 'in-progress';
    UPDATE milestones SET status = 'in_review' WHERE status = 'awaiting_review';
  `)
}

export function initSchema(db: Database.Database): void {
  log.info('initializing schema')
  db.exec(SCHEMA_SQL)
  migrateIterationUsageColumns(db)
  migrateAutoMergeColumn(db)
  migrateAutoApproveColumn(db)
  migrateMilestoneChecksTable(db)
  migrateMilestoneDropJsonColumns(db)
  migrateMilestoneCommentsTable(db)
  migrateInboxToBacklog(db)
  migrateBacklogStatusToKanban(db)
  migrateMilestoneAssigneesColumn(db)
  migrateMilestoneItemsTable(db)
  migrateDropBacklogMilestoneId(db)
  migrateMilestoneStatusV3(db)
  migrateMentionDispatchedColumn(db)
  migrateIterationStatusColumns(db)
  migrateChecksMilestoneIdColumn(db)
  migrateAgentSessionsTable(db)
  migrateDropIterationSessionColumns(db)
}
