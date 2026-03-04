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

function getProjectId(): string | null {
  return process.env.ANIMA_PROJECT_ID ?? null
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
  'Get milestone details including title, description, acceptance criteria, tasks, and iterations',
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
  'update_acceptance_criteria',
  'Update acceptance criteria for a milestone. Merges by title (upsert): existing criteria with matching titles are updated, new ones are added.',
  {
    milestone_id: z.string().describe('The milestone ID'),
    criteria: z.array(z.object({
      title: z.string().describe('Criterion title (used as merge key)'),
      status: z.enum(['pending', 'in_progress', 'passed', 'rejected']).describe('Current status'),
      description: z.string().optional().describe('Optional detailed description'),
    })).describe('Acceptance criteria to upsert'),
    iteration: z.number().describe('Current iteration number'),
  },
  async ({ milestone_id, criteria, iteration }) => {
    const updated = await client.call('milestones:mergeAcceptanceCriteria', [milestone_id, criteria, iteration])
    if (!updated) {
      return { content: [{ type: 'text' as const, text: `Milestone ${milestone_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: `Updated ${criteria.length} acceptance criteria` }] }
  }
)

server.tool(
  'update_tasks',
  'Update tasks for a milestone. Merges by title (upsert): existing tasks with matching titles are updated, new ones are added.',
  {
    milestone_id: z.string().describe('The milestone ID'),
    tasks: z.array(z.object({
      title: z.string().describe('Task title (used as merge key)'),
      completed: z.boolean().describe('Whether the task is completed'),
      description: z.string().optional().describe('Optional detailed description'),
    })).describe('Tasks to upsert'),
    iteration: z.number().describe('Current iteration number'),
  },
  async ({ milestone_id, tasks, iteration }) => {
    const updated = await client.call('milestones:mergeTasks', [milestone_id, tasks, iteration])
    if (!updated) {
      return { content: [{ type: 'text' as const, text: `Milestone ${milestone_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: `Updated ${tasks.length} tasks` }] }
  }
)

// ── Planning tools (available when ANIMA_PROJECT_ID is set) ─────────────────

server.tool(
  'list_backlog_items',
  'List all backlog items for the current project. Use this to understand what needs to be done before planning a milestone.',
  {},
  async () => {
    const projectId = getProjectId()
    if (!projectId) {
      return { content: [{ type: 'text' as const, text: 'ANIMA_PROJECT_ID not set — cannot list backlog items' }], isError: true }
    }
    const items = await client.call('backlog:list', [projectId]) as Array<{ status: string }>
    const todoItems = items.filter((i) => i.status === 'todo')
    return { content: [{ type: 'text' as const, text: JSON.stringify(todoItems, null, 2) }] }
  }
)

server.tool(
  'create_milestone',
  'Create a new milestone and link backlog items to it. The milestone will be created in draft status.',
  {
    title: z.string().describe('Milestone title'),
    description: z.string().describe('Milestone description (product-level, 1-2 paragraphs)'),
    backlog_item_ids: z.array(z.string()).describe('IDs of backlog items to link to this milestone'),
    milestone_content: z.string().describe('Full milestone markdown content following the standard format'),
  },
  async ({ title, description, backlog_item_ids, milestone_content }) => {
    const projectId = getProjectId()
    if (!projectId) {
      return { content: [{ type: 'text' as const, text: 'ANIMA_PROJECT_ID not set — cannot create milestone' }], isError: true }
    }

    const milestoneId = randomUUID()
    const now = nowISO()

    // Save milestone record
    await client.call('milestones:save', [projectId, {
      id: milestoneId,
      title,
      description,
      status: 'draft',
      acceptanceCriteria: [],
      tasks: [],
      createdAt: now,
      iterationCount: 0,
      iterations: [],
      totalTokens: 0,
      totalCost: 0,
    }])

    // Link backlog items to milestone
    for (const itemId of backlog_item_ids) {
      await client.call('backlog:update', [projectId, itemId, { milestoneId, status: 'in_progress' }])
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
