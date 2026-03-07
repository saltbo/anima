import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { homedir } from 'os'

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string
  url?: string
  headers?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

// ── Path ─────────────────────────────────────────────────────────────────────

let userDataPath: string | null = null
let _mcpPort: number | null = null

/**
 * Initialize the MCP config module.
 * Must be called once during app startup.
 */
export function initMcpConfig(dir: string, mcpPort: number): void {
  userDataPath = dir
  _mcpPort = mcpPort
}

/** @deprecated Use initMcpConfig instead. Only kept for tests. */
export function setMcpConfigDir(dir: string): void {
  userDataPath = dir
}

export function getMcpConfigPath(): string {
  if (!userDataPath) throw new Error('MCP config dir not set. Call initMcpConfig() first.')
  return path.join(userDataPath, 'mcp-config.json')
}

// ── Load / Save ──────────────────────────────────────────────────────────────

export function loadMcpConfig(): McpConfig {
  const configPath = getMcpConfigPath()
  if (!existsSync(configPath)) return { mcpServers: {} }
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as McpConfig
    if (!config.mcpServers) config.mcpServers = {}
    return config
  } catch {
    return { mcpServers: {} }
  }
}

export function saveMcpConfig(config: McpConfig): void {
  const configPath = getMcpConfigPath()
  const dir = path.dirname(configPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

// ── Build config ─────────────────────────────────────────────────────────────

/**
 * Build a full MCP config with the anima entry always present,
 * plus any user-installed servers from the persisted config.
 */
export function buildMcpConfig(mcpPort: number): McpConfig {
  const existing = loadMcpConfig()

  // Remove stale anima entry from user config (we always rebuild it)
  const userServers = { ...existing.mcpServers }
  delete userServers.anima

  return {
    mcpServers: {
      anima: {
        type: 'http',
        url: `http://127.0.0.1:${mcpPort}/mcp`,
      },
      ...userServers,
    },
  }
}

/**
 * Write the centralized MCP config file and return its path.
 * Uses the mcpPort set via initMcpConfig().
 */
export function ensureMcpConfigFile(): string {
  if (!_mcpPort) {
    throw new Error('MCP config not initialized. Call initMcpConfig() first.')
  }
  const config = buildMcpConfig(_mcpPort)
  const configPath = getMcpConfigPath()
  const dir = path.dirname(configPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  return configPath
}

// ── User MCP Server CRUD ─────────────────────────────────────────────────────

export function getUserMcpServers(): Record<string, McpServerEntry> {
  const config = loadMcpConfig()
  const servers = { ...config.mcpServers }
  delete servers.anima
  return servers
}

export function addUserMcpServer(name: string, entry: McpServerEntry): void {
  if (name === 'anima') throw new Error('Cannot overwrite the built-in anima server')
  const config = loadMcpConfig()
  config.mcpServers[name] = entry
  saveMcpConfig(config)
}

export function updateUserMcpServer(name: string, entry: McpServerEntry): void {
  if (name === 'anima') throw new Error('Cannot modify the built-in anima server')
  const config = loadMcpConfig()
  if (!config.mcpServers[name]) throw new Error(`MCP server "${name}" not found`)
  config.mcpServers[name] = entry
  saveMcpConfig(config)
}

export function removeUserMcpServer(name: string): void {
  if (name === 'anima') throw new Error('Cannot remove the built-in anima server')
  const config = loadMcpConfig()
  delete config.mcpServers[name]
  saveMcpConfig(config)
}

// ── System-level Claude MCP Servers ─────────────────────────────────────────

/**
 * Read MCP servers from the system-level Claude config at ~/.claude.json.
 * Returns only the mcpServers object (STDIO + HTTP entries).
 */
export function getSystemClaudeMcpServers(): Record<string, McpServerEntry> {
  const configPath = path.join(homedir(), '.claude.json')
  if (!existsSync(configPath)) return {}
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    if (!config.mcpServers || typeof config.mcpServers !== 'object') return {}
    return config.mcpServers as Record<string, McpServerEntry>
  } catch {
    return {}
  }
}
