import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import type { Project } from '../../../src/types/index'

interface ProjectRow {
  id: string
  path: string
  name: string
  added_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    addedAt: row.added_at,
  }
}

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  getAll(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY added_at').all() as ProjectRow[]
    return rows.map(rowToProject)
  }

  getById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  getByPath(projectPath: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  add(projectPath: string): Project {
    const project: Project = {
      id: randomUUID(),
      path: projectPath,
      name: path.basename(projectPath),
      addedAt: new Date().toISOString(),
    }
    this.db.prepare('INSERT INTO projects (id, path, name, added_at) VALUES (?, ?, ?, ?)').run(
      project.id,
      project.path,
      project.name,
      project.addedAt
    )
    // Also create default project_state
    this.db.prepare('INSERT INTO project_state (project_id) VALUES (?)').run(project.id)
    return project
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  resolveProjectId(projectPath: string): string | null {
    const row = this.db.prepare('SELECT id FROM projects WHERE path = ?').get(projectPath) as
      | { id: string }
      | undefined
    return row?.id ?? null
  }
}
