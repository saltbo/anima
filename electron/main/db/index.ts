import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { createLogger } from '../logger'

const log = createLogger('db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'anima.db')
  log.info('opening database', { path: dbPath })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function closeDb(): void {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
    db = null
    log.info('database closed')
  }
}
