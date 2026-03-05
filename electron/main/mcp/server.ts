#!/usr/bin/env node
/**
 * Anima MCP Server — standalone process spawned by Claude Code CLI.
 * Provides tools for agents to read/write milestone data.
 *
 * Connects to the Electron main process via a Unix domain socket
 * (ANIMA_BRIDGE_SOCKET) using JSON-RPC. No native modules required.
 *
 * Each MCP tool maps 1:1 to an API handler in routes.ts.
 * Business logic lives in the Service layer — this file is a thin adapter.
 */

import * as net from 'net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getAllAgents } from '../agents/registry'

// ── Socket Client ─────────────────────────────────────────────────────────────

class SocketClient {
  private socketPath: string
  private nextId = 1

  constructor(socketPath: string) {
    this.socketPath = socketPath
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const conn = net.createConnection(this.socketPath)
      let buffer = ''

      conn.on('connect', () => {
        const req = JSON.stringify({ id, method, params }) + '\n'
        conn.write(req)
      })

      conn.on('data', (chunk) => {
        buffer += chunk.toString()
        const newlineIdx = buffer.indexOf('\n')
        if (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim()
          conn.end()
          try {
            const resp = JSON.parse(line) as { id: number; result?: unknown; error?: { message: string } }
            if (resp.error) {
              reject(new Error(resp.error.message))
            } else {
              resolve(resp.result)
            }
          } catch (e) {
            reject(new Error(`Invalid response: ${line}`))
          }
        }
      })

      conn.on('error', (err) => {
        reject(new Error(`Socket connection error: ${err.message}`))
      })

      conn.on('timeout', () => {
        conn.end()
        reject(new Error('Socket connection timeout'))
      })

      conn.setTimeout(30000)
    })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString()
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) }
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'anima',
  version: '1.0.0',
})

let client: SocketClient

// ── Milestone tools ─────────────────────────────────────────────────────────

server.tool(
  'milestones:getById',
  'Get milestone details including title, description, backlog items, checks, and iterations',
  { milestone_id: z.string().describe('The milestone ID') },
  async ({ milestone_id }) => {
    const milestone = await client.call('milestones:getById', [milestone_id])
    if (!milestone) {
      return textResult(`Milestone ${milestone_id} not found`, true)
    }
    return textResult(JSON.stringify(milestone, null, 2))
  }
)

server.tool(
  'milestones:create',
  'Create a new milestone, link backlog items, and define acceptance checks for each item. The milestone will be created in draft status.',
  {
    project_id: z.string().describe('The project ID'),
    title: z.string().describe('Milestone title'),
    description: z.string().describe('Milestone description — full milestone content in markdown, including product-level context and requirements'),
    backlog_items: z.array(z.object({
      id: z.string().describe('Backlog item ID'),
      checks: z.array(z.object({
        title: z.string().describe('Acceptance check title — must be observable and binary'),
        description: z.string().optional().describe('Optional detailed description of what to verify'),
      })).describe('Acceptance checks for this backlog item'),
    })).describe('Backlog items to include, each with its acceptance checks'),
  },
  async ({ project_id, title, description, backlog_items }) => {
    const result = await client.call('milestones:create', [project_id, {
      title,
      description,
      backlogItems: backlog_items,
    }])
    return textResult(JSON.stringify(result, null, 2))
  }
)

// ── Comment tools ───────────────────────────────────────────────────────────

server.tool(
  'milestones:listComments',
  'List all comments for a milestone, ordered by creation time',
  { milestone_id: z.string().describe('The milestone ID') },
  async ({ milestone_id }) => {
    const comments = await client.call('milestones:listComments', [milestone_id])
    return textResult(JSON.stringify(comments, null, 2))
  }
)

server.tool(
  'milestones:addComment',
  'Add a comment to a milestone (used for developer reports and reviewer feedback)',
  {
    milestone_id: z.string().describe('The milestone ID'),
    body: z.string().describe('The comment body (markdown supported)'),
    author: z.string().describe('Your agent ID (e.g. "developer", "reviewer", "planner")'),
  },
  async ({ milestone_id, body, author }) => {
    const now = nowISO()
    const id = randomUUID()
    await client.call('milestones:addComment', [{
      id,
      milestoneId: milestone_id,
      body,
      author,
      createdAt: now,
      updatedAt: now,
    }])
    return textResult(`Comment added (id: ${id})`)
  }
)

// ── Check tools ─────────────────────────────────────────────────────────────

server.tool(
  'checks:list',
  'List checks for a milestone',
  {
    milestone_id: z.string().describe('The milestone ID'),
  },
  async ({ milestone_id }) => {
    const checks = await client.call('checks:list', [milestone_id])
    return textResult(JSON.stringify(checks, null, 2))
  }
)

server.tool(
  'checks:add',
  'Add checks to a backlog item. Each check represents a verification criterion.',
  {
    milestone_id: z.string().describe('The milestone ID these checks belong to'),
    item_id: z.string().describe('The backlog item ID to add checks to'),
    checks: z.array(z.object({
      title: z.string().describe('Check title'),
      description: z.string().optional().describe('Optional detailed description'),
      status: z.enum(['pending', 'checking', 'passed', 'rejected']).default('pending').describe('Check status'),
      iteration: z.number().default(0).describe('Iteration number'),
    })).describe('Checks to add'),
  },
  async ({ milestone_id, item_id, checks }) => {
    const checksWithIds = checks.map((c) => ({ ...c, milestoneId: milestone_id, itemId: item_id }))
    const created = await client.call('checks:add', [checksWithIds])
    return textResult(`Added ${(created as unknown[]).length} checks`)
  }
)

server.tool(
  'checks:update',
  'Update a single check\'s status or other properties',
  {
    check_id: z.string().describe('The check ID'),
    status: z.enum(['pending', 'checking', 'passed', 'rejected']).optional().describe('New status'),
    title: z.string().optional().describe('Updated title'),
    description: z.string().optional().describe('Updated description'),
    iteration: z.number().optional().describe('Updated iteration number'),
  },
  async ({ check_id, ...patch }) => {
    const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    const updated = await client.call('checks:update', [check_id, filtered])
    if (!updated) {
      return textResult(`Check ${check_id} not found`, true)
    }
    return textResult(`Check ${check_id} updated`)
  }
)

// ── Backlog tools ───────────────────────────────────────────────────────────

server.tool(
  'backlog:list',
  'List all backlog items for a project. Use this to understand what needs to be done before planning a milestone.',
  { project_id: z.string().describe('The project ID') },
  async ({ project_id }) => {
    const items = await client.call('backlog:list', [project_id]) as Array<{ status: string }>
    const todoItems = items.filter((i) => i.status === 'todo')
    return textResult(JSON.stringify(todoItems, null, 2))
  }
)

server.tool(
  'backlog:update',
  'Update a backlog item\'s status or other properties (e.g., mark as done)',
  {
    project_id: z.string().describe('The project ID'),
    item_id: z.string().describe('The backlog item ID'),
    status: z.enum(['todo', 'in_progress', 'done', 'closed']).optional().describe('New status'),
    title: z.string().optional().describe('Updated title'),
    description: z.string().optional().describe('Updated description'),
  },
  async ({ project_id, item_id, ...patch }) => {
    const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    const updated = await client.call('backlog:update', [project_id, item_id, filtered])
    if (!updated) {
      return textResult(`Backlog item ${item_id} not found`, true)
    }
    return textResult(`Backlog item ${item_id} updated`)
  }
)

// ── Transition tools ────────────────────────────────────────────────────

server.tool(
  'milestones:transition',
  'Transition a milestone to a new status via a state-machine action (e.g. approve, cancel, close)',
  {
    project_id: z.string().describe('The project ID'),
    milestone_id: z.string().describe('The milestone ID'),
    action: z.enum(['approve', 'cancel', 'close', 'accept', 'request_changes', 'rollback', 'reopen']).describe('The transition action to perform'),
  },
  async ({ project_id, milestone_id, action }) => {
    try {
      await client.call('milestones:transition', [project_id, milestone_id, { action }])
      return textResult(`Milestone ${milestone_id} transitioned via action: ${action}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return textResult(`Transition failed: ${msg}`, true)
    }
  }
)

// ── Agent tools ─────────────────────────────────────────────────────────────

server.tool(
  'agents:list',
  'List all available agent definitions (id, name, description)',
  {},
  async () => {
    const agents = getAllAgents().map(({ id, name, description }) => ({ id, name, description }))
    return textResult(JSON.stringify(agents, null, 2))
  }
)

server.tool(
  'milestones:assignAgent',
  'Assign an agent to a milestone by adding its ID to the assignees list',
  {
    milestone_id: z.string().describe('The milestone ID'),
    agent_id: z.string().describe('The agent ID to assign'),
  },
  async ({ milestone_id, agent_id }) => {
    await client.call('milestones:assignAgent', [milestone_id, agent_id])
    return textResult(`Agent ${agent_id} assigned to milestone ${milestone_id}`)
  }
)

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const socketPath = process.env.ANIMA_BRIDGE_SOCKET
  if (!socketPath) {
    throw new Error('ANIMA_BRIDGE_SOCKET environment variable is required')
  }

  client = new SocketClient(socketPath)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Anima MCP Server running on stdio (bridge mode)')
}

main().catch((error) => {
  console.error('Fatal error in Anima MCP Server:', error)
  process.exit(1)
})
