#!/usr/bin/env node
/**
 * Anima MCP Server — standalone process spawned by Claude Code CLI.
 * Provides tools for agents to read/write milestone data.
 *
 * Connects to the Electron main process via a Unix domain socket
 * (ANIMA_BRIDGE_SOCKET) using JSON-RPC. No native modules required.
 */

import * as net from 'net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { randomUUID } from 'crypto'
import { z } from 'zod'

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

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'anima',
  version: '1.0.0',
})

let client: SocketClient

// ── Tools ────────────────────────────────────────────────────────────────────

server.tool(
  'get_milestone',
  'Get milestone details including title, description, backlog items, checks, and iterations',
  { milestone_id: z.string().describe('The milestone ID') },
  async ({ milestone_id }) => {
    const milestone = await client.call('milestones:getById', [milestone_id])
    if (!milestone) {
      return { content: [{ type: 'text' as const, text: `Milestone ${milestone_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(milestone, null, 2) }] }
  }
)

server.tool(
  'list_comments',
  'List all comments for a milestone, ordered by creation time',
  { milestone_id: z.string().describe('The milestone ID') },
  async ({ milestone_id }) => {
    const comments = await client.call('milestone:comments', [milestone_id])
    return { content: [{ type: 'text' as const, text: JSON.stringify(comments, null, 2) }] }
  }
)

server.tool(
  'add_comment',
  'Add a comment to a milestone (used for developer reports and acceptor feedback)',
  {
    milestone_id: z.string().describe('The milestone ID'),
    body: z.string().describe('The comment body (markdown supported)'),
  },
  async ({ milestone_id, body }) => {
    const now = nowISO()
    const id = randomUUID()
    await client.call('milestone:addComment', [{
      id,
      milestoneId: milestone_id,
      body,
      author: 'system',
      createdAt: now,
      updatedAt: now,
    }])
    return { content: [{ type: 'text' as const, text: `Comment added (id: ${id})` }] }
  }
)

server.tool(
  'list_checks',
  'List checks for a milestone (via milestone_id) or a specific backlog item (via item_id)',
  {
    milestone_id: z.string().optional().describe('The milestone ID — list all checks for this milestone'),
    item_id: z.string().optional().describe('The backlog item ID — list checks for this item'),
  },
  async ({ milestone_id, item_id }) => {
    if (!milestone_id && !item_id) {
      return { content: [{ type: 'text' as const, text: 'Either milestone_id or item_id is required' }], isError: true }
    }
    const checks = await client.call('checks:list', [milestone_id ?? item_id])
    return { content: [{ type: 'text' as const, text: JSON.stringify(checks, null, 2) }] }
  }
)

server.tool(
  'add_checks',
  'Add checks to a backlog item. Each check represents a verification criterion.',
  {
    item_id: z.string().describe('The backlog item ID to add checks to'),
    checks: z.array(z.object({
      title: z.string().describe('Check title'),
      description: z.string().optional().describe('Optional detailed description'),
      status: z.enum(['pending', 'checking', 'passed', 'rejected']).default('pending').describe('Check status'),
      iteration: z.number().default(0).describe('Iteration number'),
    })).describe('Checks to add'),
  },
  async ({ item_id, checks }) => {
    const checksWithItemId = checks.map((c) => ({ ...c, itemId: item_id }))
    const created = await client.call('checks:add', [checksWithItemId])
    return { content: [{ type: 'text' as const, text: `Added ${(created as unknown[]).length} checks` }] }
  }
)

server.tool(
  'update_check',
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
      return { content: [{ type: 'text' as const, text: `Check ${check_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: `Check ${check_id} updated` }] }
  }
)

server.tool(
  'update_backlog_item',
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
      return { content: [{ type: 'text' as const, text: `Backlog item ${item_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: `Backlog item ${item_id} updated` }] }
  }
)

// ── Planning tools ───────────────────────────────────────────────────────────

server.tool(
  'list_backlog_items',
  'List all backlog items for a project. Use this to understand what needs to be done before planning a milestone.',
  { project_id: z.string().describe('The project ID') },
  async ({ project_id }) => {
    const items = await client.call('backlog:list', [project_id]) as Array<{ status: string }>
    const todoItems = items.filter((i) => i.status === 'todo')
    return { content: [{ type: 'text' as const, text: JSON.stringify(todoItems, null, 2) }] }
  }
)

server.tool(
  'create_milestone',
  'Create a new milestone and link backlog items to it. The milestone will be created in draft status.',
  {
    project_id: z.string().describe('The project ID'),
    title: z.string().describe('Milestone title'),
    description: z.string().describe('Milestone description (product-level, 1-2 paragraphs)'),
    backlog_item_ids: z.array(z.string()).describe('IDs of backlog items to link to this milestone'),
    milestone_content: z.string().describe('Full milestone markdown content following the standard format'),
  },
  async ({ project_id, title, description, backlog_item_ids, milestone_content }) => {
    const milestoneId = randomUUID()
    const now = nowISO()

    // Save milestone record
    await client.call('milestones:save', [project_id, {
      id: milestoneId,
      title,
      description,
      status: 'draft',
      items: [],
      checks: [],
      createdAt: now,
      iterationCount: 0,
      iterations: [],
      totalTokens: 0,
      totalCost: 0,
    }])

    // Link backlog items to milestone
    for (const itemId of backlog_item_ids) {
      await client.call('backlog:update', [project_id, itemId, { milestoneId, status: 'in_progress' }])
    }

    // Store milestone content as a comment for reference
    await client.call('milestone:addComment', [{
      id: randomUUID(),
      milestoneId,
      body: milestone_content,
      author: 'system',
      createdAt: now,
      updatedAt: now,
    }])

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ milestoneId, title, linkedBacklogItems: backlog_item_ids.length }, null, 2),
      }],
    }
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
