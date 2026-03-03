import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureAnimaMcpConfig, buildAnimaMcpEntry } from '../mcpConfig'

describe('buildAnimaMcpEntry', () => {
  it('returns correct entry structure', () => {
    const entry = buildAnimaMcpEntry('/path/to/mcp-server.js', '/path/to/anima.db')
    expect(entry).toEqual({
      command: 'node',
      args: ['/path/to/mcp-server.js'],
      env: { ANIMA_DB_PATH: '/path/to/anima.db' },
    })
  })
})

describe('ensureAnimaMcpConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'anima-mcp-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .mcp.json when none exists', () => {
    ensureAnimaMcpConfig(tmpDir, '/path/to/mcp-server.js', '/path/to/anima.db')

    const config = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers.anima).toEqual({
      command: 'node',
      args: ['/path/to/mcp-server.js'],
      env: { ANIMA_DB_PATH: '/path/to/anima.db' },
    })
  })

  it('preserves existing MCP entries when merging', () => {
    const existing = {
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['playwright-mcp'],
        },
      },
    }
    writeFileSync(join(tmpDir, '.mcp.json'), JSON.stringify(existing))

    ensureAnimaMcpConfig(tmpDir, '/path/to/mcp-server.js', '/path/to/anima.db')

    const config = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers.playwright).toEqual({
      command: 'npx',
      args: ['playwright-mcp'],
    })
    expect(config.mcpServers.anima).toBeDefined()
  })

  it('overwrites existing anima entry', () => {
    const existing = {
      mcpServers: {
        anima: {
          command: 'node',
          args: ['/old/path.js'],
          env: { ANIMA_DB_PATH: '/old/db.db' },
        },
      },
    }
    writeFileSync(join(tmpDir, '.mcp.json'), JSON.stringify(existing))

    ensureAnimaMcpConfig(tmpDir, '/new/path.js', '/new/db.db')

    const config = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers.anima.args[0]).toBe('/new/path.js')
    expect(config.mcpServers.anima.env.ANIMA_DB_PATH).toBe('/new/db.db')
  })

  it('handles corrupted .mcp.json gracefully', () => {
    writeFileSync(join(tmpDir, '.mcp.json'), 'not valid json{{{')

    ensureAnimaMcpConfig(tmpDir, '/path/to/mcp-server.js', '/path/to/anima.db')

    const config = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers.anima).toBeDefined()
  })
})
