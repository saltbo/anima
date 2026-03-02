import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type Database from 'better-sqlite3'
import { createLogger } from '../logger'
import type { Project, ProjectState, InboxItem, Milestone } from '../../../src/types/index'

const log = createLogger('db-migrate')

interface AppConfig {
  projects: Project[]
}

export function migrateFromJson(db: Database.Database): void {
  const configFile = path.join(app.getPath('userData'), 'config.json')
  if (!fs.existsSync(configFile)) {
    log.info('no config.json found, skipping migration')
    return
  }

  // Check if migration already happened
  const existing = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }
  if (existing.count > 0) {
    log.info('projects already exist in DB, skipping migration')
    return
  }

  log.info('starting JSON → SQLite migration')

  let config: AppConfig
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  } catch (err) {
    log.error('failed to read config.json', { error: String(err) })
    return
  }

  const migrateAll = db.transaction(() => {
    for (const project of config.projects) {
      migrateProject(db, project)
    }
  })

  try {
    migrateAll()
    log.info('migration complete', { projects: config.projects.length })

    // Rename old files to .bak
    renameToBackup(configFile)
  } catch (err) {
    log.error('migration failed', { error: String(err) })
  }
}

function migrateProject(db: Database.Database, project: Project): void {
  // Insert project
  db.prepare('INSERT OR IGNORE INTO projects (id, path, name, added_at) VALUES (?, ?, ?, ?)').run(
    project.id,
    project.path,
    project.name,
    project.addedAt
  )

  // Migrate state.json
  const statePath = path.join(project.path, '.anima', 'state.json')
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as ProjectState
      db.prepare(
        `INSERT OR IGNORE INTO project_state
         (project_id, status, current_iteration, next_wake_time, wake_schedule, total_tokens, total_cost, rate_limit_reset_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        project.id,
        state.status ?? 'sleeping',
        state.currentIteration ? JSON.stringify(state.currentIteration) : null,
        state.nextWakeTime ?? null,
        JSON.stringify(state.wakeSchedule ?? { mode: 'manual', intervalMinutes: null, times: [] }),
        state.totalTokens ?? 0,
        state.totalCost ?? 0,
        state.rateLimitResetAt ?? null
      )
      renameToBackup(statePath)
    } catch (err) {
      log.warn('failed to migrate state.json', { project: project.path, error: String(err) })
    }
  }

  // Ensure default project_state exists
  db.prepare(
    'INSERT OR IGNORE INTO project_state (project_id) VALUES (?)'
  ).run(project.id)

  // Migrate inbox.json
  const inboxPath = path.join(project.path, '.anima', 'inbox.json')
  if (fs.existsSync(inboxPath)) {
    try {
      const items = JSON.parse(fs.readFileSync(inboxPath, 'utf-8')) as InboxItem[]
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO inbox_items
         (id, project_id, type, title, description, priority, status, milestone_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const item of items) {
        stmt.run(
          item.id,
          project.id,
          item.type ?? 'idea',
          item.title,
          item.description ?? null,
          item.priority ?? 'medium',
          item.status ?? 'pending',
          item.milestoneId ?? null,
          item.createdAt
        )
      }
      renameToBackup(inboxPath)
    } catch (err) {
      log.warn('failed to migrate inbox.json', { project: project.path, error: String(err) })
    }
  }

  // Migrate milestones.json
  const milestonesPath = path.join(project.path, '.anima', 'milestones.json')
  if (fs.existsSync(milestonesPath)) {
    try {
      const milestones = JSON.parse(fs.readFileSync(milestonesPath, 'utf-8')) as Milestone[]
      const msStmt = db.prepare(
        `INSERT OR IGNORE INTO milestones
         (id, project_id, title, description, status, acceptance_criteria, tasks, inbox_item_ids, review, created_at, completed_at, iteration_count, base_commit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const iterStmt = db.prepare(
        `INSERT INTO iterations
         (milestone_id, round, developer_session_id, acceptor_session_id, outcome, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      for (const m of milestones) {
        msStmt.run(
          m.id,
          project.id,
          m.title,
          m.description ?? '',
          m.status ?? 'draft',
          JSON.stringify(m.acceptanceCriteria ?? []),
          JSON.stringify(m.tasks ?? []),
          JSON.stringify(m.inboxItemIds ?? []),
          m.review ?? null,
          m.createdAt,
          m.completedAt ?? null,
          m.iterationCount ?? 0,
          m.baseCommit ?? null
        )
        for (const iter of m.iterations ?? []) {
          iterStmt.run(
            m.id,
            iter.round,
            iter.developerSessionId ?? null,
            iter.acceptorSessionId ?? null,
            iter.outcome ?? null,
            iter.startedAt ?? null,
            iter.completedAt ?? null
          )
        }
      }
      renameToBackup(milestonesPath)
    } catch (err) {
      log.warn('failed to migrate milestones.json', { project: project.path, error: String(err) })
    }
  }

  log.info('migrated project', { id: project.id, name: project.name })
}

function renameToBackup(filePath: string): void {
  const bakPath = `${filePath}.bak`
  try {
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, bakPath)
      log.info('renamed to backup', { from: filePath, to: bakPath })
    }
  } catch (err) {
    log.warn('failed to rename backup', { path: filePath, error: String(err) })
  }
}
