import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

interface McpServerEntry {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

/**
 * Build the Anima MCP server entry for a project's .mcp.json.
 */
export function buildAnimaMcpEntry(mcpServerPath: string, dbPath: string, projectId?: string): McpServerEntry {
  const env: Record<string, string> = { ANIMA_DB_PATH: dbPath }
  if (projectId) env.ANIMA_PROJECT_ID = projectId
  return {
    command: 'node',
    args: [mcpServerPath],
    env,
  }
}

/**
 * Ensure the project's .mcp.json contains the Anima MCP server entry.
 * Preserves any existing entries (e.g. Playwright MCP).
 * Creates the file if it doesn't exist.
 */
export function ensureAnimaMcpConfig(projectPath: string, mcpServerPath: string, dbPath: string, projectId?: string): void {
  const configPath = path.join(projectPath, '.mcp.json')
  let config: McpConfig = { mcpServers: {} }

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8')
      config = JSON.parse(raw) as McpConfig
      if (!config.mcpServers) config.mcpServers = {}
    } catch {
      // If file is corrupted, start fresh but keep the file
      config = { mcpServers: {} }
    }
  }

  config.mcpServers.anima = buildAnimaMcpEntry(mcpServerPath, dbPath, projectId)
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
