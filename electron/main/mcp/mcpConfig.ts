import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerEntry {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

// ── Path ─────────────────────────────────────────────────────────────────────

let userDataPath: string | null = null
let _mcpServerPath: string | null = null
let _bridgeSocketPath: string | null = null

/**
 * Initialize the MCP config module.
 * Must be called once during app startup with all three paths.
 */
export function initMcpConfig(dir: string, mcpServerPath: string, bridgeSocketPath: string): void {
  userDataPath = dir
  _mcpServerPath = mcpServerPath
  _bridgeSocketPath = bridgeSocketPath
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
export function buildMcpConfig(mcpServerPath: string, bridgeSocketPath: string): McpConfig {
  const env: Record<string, string> = { ANIMA_BRIDGE_SOCKET: bridgeSocketPath }

  const existing = loadMcpConfig()

  // Remove stale anima entry from user config (we always rebuild it)
  const userServers = { ...existing.mcpServers }
  delete userServers.anima

  return {
    mcpServers: {
      anima: {
        command: 'node',
        args: [mcpServerPath],
        env,
      },
      ...userServers,
    },
  }
}

/**
 * Write the centralized MCP config file and return its path.
 * Uses the mcpServerPath and bridgeSocketPath set via initMcpConfig().
 */
export function ensureMcpConfigFile(): string {
  if (!_mcpServerPath || !_bridgeSocketPath) {
    throw new Error('MCP config not initialized. Call initMcpConfig() first.')
  }
  const config = buildMcpConfig(_mcpServerPath, _bridgeSocketPath)
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
