import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import type { Project } from '../../../src/types/index'

export interface AppConfig {
  projects: Project[]
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')

function ensureConfigDir(): void {
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function loadConfig(): AppConfig {
  ensureConfigDir()
  if (!fs.existsSync(CONFIG_FILE)) {
    return { projects: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return { projects: [] }
  }
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

export function getProjects(): Project[] {
  return loadConfig().projects.map((p) => ({
    id: p.id,
    path: p.path,
    name: p.name,
    addedAt: p.addedAt,
  }))
}

export function addProject(projectPath: string): Project {
  const config = loadConfig()
  const name = path.basename(projectPath)
  const project: Project = {
    id: randomUUID(),
    path: projectPath,
    name,
    addedAt: new Date().toISOString(),
  }
  config.projects.push(project)
  saveConfig(config)
  return project
}

export function removeProject(id: string): void {
  const config = loadConfig()
  config.projects = config.projects.filter((p) => p.id !== id)
  saveConfig(config)
}
