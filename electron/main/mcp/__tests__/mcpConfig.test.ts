import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  setMcpConfigDir,
  initMcpConfig,
  getMcpConfigPath,
  loadMcpConfig,
  saveMcpConfig,
  buildMcpConfig,
  ensureMcpConfigFile,
  getUserMcpServers,
  addUserMcpServer,
  updateUserMcpServer,
  removeUserMcpServer,
} from '../mcpConfig'

describe('mcpConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'anima-mcp-test-'))
    setMcpConfigDir(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('getMcpConfigPath', () => {
    it('returns path inside configured directory', () => {
      expect(getMcpConfigPath()).toBe(join(tmpDir, 'mcp-config.json'))
    })
  })

  describe('loadMcpConfig', () => {
    it('returns empty config when file does not exist', () => {
      expect(loadMcpConfig()).toEqual({ mcpServers: {} })
    })

    it('reads existing config', () => {
      const config = { mcpServers: { test: { command: 'echo', args: ['hi'] } } }
      writeFileSync(join(tmpDir, 'mcp-config.json'), JSON.stringify(config))
      expect(loadMcpConfig()).toEqual(config)
    })

    it('handles corrupted file gracefully', () => {
      writeFileSync(join(tmpDir, 'mcp-config.json'), 'not valid json{{{')
      expect(loadMcpConfig()).toEqual({ mcpServers: {} })
    })
  })

  describe('saveMcpConfig', () => {
    it('writes config to disk', () => {
      const config = { mcpServers: { foo: { command: 'bar', args: [] } } }
      saveMcpConfig(config)
      const raw = readFileSync(join(tmpDir, 'mcp-config.json'), 'utf-8')
      expect(JSON.parse(raw)).toEqual(config)
    })
  })

  describe('buildMcpConfig', () => {
    it('includes anima entry with HTTP URL', () => {
      const config = buildMcpConfig(24817)
      expect(config.mcpServers.anima).toEqual({
        type: 'http',
        url: 'http://127.0.0.1:24817/mcp',
      })
    })

    it('merges user-installed servers', () => {
      const existing = { mcpServers: { custom: { command: 'npx', args: ['my-mcp'] } } }
      writeFileSync(join(tmpDir, 'mcp-config.json'), JSON.stringify(existing))

      const config = buildMcpConfig(24817)
      expect(config.mcpServers.anima).toBeDefined()
      expect(config.mcpServers.custom).toEqual({ command: 'npx', args: ['my-mcp'] })
    })
  })

  describe('ensureMcpConfigFile', () => {
    it('writes config and returns path', () => {
      initMcpConfig(tmpDir, 24817)
      const configPath = ensureMcpConfigFile()
      expect(configPath).toBe(join(tmpDir, 'mcp-config.json'))
      expect(existsSync(configPath)).toBe(true)

      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(config.mcpServers.anima).toBeDefined()
      expect(config.mcpServers.anima.url).toBe('http://127.0.0.1:24817/mcp')
    })
  })

  describe('user MCP server CRUD', () => {
    it('getUserMcpServers excludes anima', () => {
      const config = { mcpServers: { anima: { type: 'http', url: 'http://localhost:24817/mcp' }, custom: { command: 'npx', args: [] } } }
      writeFileSync(join(tmpDir, 'mcp-config.json'), JSON.stringify(config))

      const servers = getUserMcpServers()
      expect(servers.anima).toBeUndefined()
      expect(servers.custom).toBeDefined()
    })

    it('addUserMcpServer adds entry', () => {
      addUserMcpServer('test', { command: 'echo', args: ['hello'] })
      const servers = getUserMcpServers()
      expect(servers.test).toEqual({ command: 'echo', args: ['hello'] })
    })

    it('addUserMcpServer rejects anima name', () => {
      expect(() => addUserMcpServer('anima', { command: 'x', args: [] })).toThrow('built-in')
    })

    it('updateUserMcpServer updates existing entry', () => {
      addUserMcpServer('test', { command: 'echo', args: ['v1'] })
      updateUserMcpServer('test', { command: 'echo', args: ['v2'] })
      const servers = getUserMcpServers()
      expect(servers.test.args).toEqual(['v2'])
    })

    it('updateUserMcpServer rejects anima name', () => {
      expect(() => updateUserMcpServer('anima', { command: 'x', args: [] })).toThrow('built-in')
    })

    it('updateUserMcpServer throws for non-existent server', () => {
      expect(() => updateUserMcpServer('ghost', { command: 'x', args: [] })).toThrow('not found')
    })

    it('removeUserMcpServer removes entry', () => {
      addUserMcpServer('test', { command: 'echo', args: [] })
      removeUserMcpServer('test')
      const servers = getUserMcpServers()
      expect(servers.test).toBeUndefined()
    })

    it('removeUserMcpServer rejects anima name', () => {
      expect(() => removeUserMcpServer('anima')).toThrow('built-in')
    })
  })
})
