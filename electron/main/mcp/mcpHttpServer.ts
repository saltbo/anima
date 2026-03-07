/**
 * Anima MCP HTTP Server — runs inside the Electron main process.
 * Provides tools for agents via Streamable HTTP transport.
 *
 * Each MCP tool maps 1:1 to an API route handler.
 * Business logic lives in the Service layer — this file is a thin adapter.
 */

import * as http from 'http'
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { createLogger } from '../logger'
import type { ApiHandler } from '../api/routes'

const log = createLogger('mcp-http')

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString()
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) }
}

// ── Server setup ─────────────────────────────────────────────────────────────

function createMcpServer(routes: Record<string, ApiHandler>): McpServer {
  const server = new McpServer({ name: 'anima', version: '1.0.0' })

  // Helper to call a route handler
  const call = async (method: string, params: unknown[] = []): Promise<unknown> => {
    const handler = routes[method]
    if (!handler) throw new Error(`Route not found: ${method}`)
    return handler(...params)
  }

  // ── Milestone tools ─────────────────────────────────────────────────────

  server.tool(
    'milestones.getById',
    'Get milestone details including title, description, backlog items, checks, and iterations',
    { milestone_id: z.string().describe('The milestone ID') },
    async ({ milestone_id }) => {
      const milestone = await call('milestones:getById', [milestone_id])
      if (!milestone) return textResult(`Milestone ${milestone_id} not found`, true)
      return textResult(JSON.stringify(milestone, null, 2))
    }
  )

  server.tool(
    'milestones.create',
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
      const result = await call('milestones.create', [project_id, {
        title,
        description,
        backlogItems: backlog_items,
      }])
      return textResult(JSON.stringify(result, null, 2))
    }
  )

  // ── Comment tools ───────────────────────────────────────────────────────

  server.tool(
    'milestones.listComments',
    'List all comments for a milestone, ordered by creation time',
    { milestone_id: z.string().describe('The milestone ID') },
    async ({ milestone_id }) => {
      const comments = await call('milestones.listComments', [milestone_id])
      return textResult(JSON.stringify(comments, null, 2))
    }
  )

  server.tool(
    'milestones.addComment',
    'Add a comment to a milestone (used for developer reports and reviewer feedback)',
    {
      milestone_id: z.string().describe('The milestone ID'),
      body: z.string().describe('The comment body (markdown supported)'),
      author: z.string().describe('Your agent ID (e.g. "developer", "reviewer", "planner")'),
    },
    async ({ milestone_id, body, author }) => {
      const now = nowISO()
      const id = randomUUID()
      await call('milestones.addComment', [{
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

  // ── Check tools ─────────────────────────────────────────────────────────

  server.tool(
    'checks.list',
    'List checks for a milestone',
    { milestone_id: z.string().describe('The milestone ID') },
    async ({ milestone_id }) => {
      const checks = await call('checks.list', [milestone_id])
      return textResult(JSON.stringify(checks, null, 2))
    }
  )

  server.tool(
    'checks.add',
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
      const created = await call('checks.add', [checksWithIds])
      return textResult(`Added ${(created as unknown[]).length} checks`)
    }
  )

  server.tool(
    'checks.update',
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
      const updated = await call('checks.update', [check_id, filtered])
      if (!updated) return textResult(`Check ${check_id} not found`, true)
      return textResult(`Check ${check_id} updated`)
    }
  )

  // ── Backlog tools ───────────────────────────────────────────────────────

  server.tool(
    'backlog.list',
    'List backlog items for a project. Returns all items by default, or filter by status.',
    {
      project_id: z.string().describe('The project ID'),
      status: z.enum(['todo', 'in_progress', 'done', 'closed']).optional().describe('Filter by status (omit to return all items)'),
    },
    async ({ project_id, status }) => {
      const items = await call('backlog.list', [project_id]) as Array<{ status: string }>
      const filtered = status ? items.filter((i) => i.status === status) : items
      return textResult(JSON.stringify(filtered, null, 2))
    }
  )

  server.tool(
    'backlog.add',
    'Add a new backlog item to a project',
    {
      project_id: z.string().describe('The project ID'),
      type: z.enum(['idea', 'bug', 'feature']).describe('Item type'),
      title: z.string().describe('Item title'),
      description: z.string().optional().describe('Item description'),
      priority: z.enum(['low', 'medium', 'high']).describe('Item priority'),
    },
    async ({ project_id, type, title, description, priority }) => {
      const item = await call('backlog.add', [project_id, { type, title, description, priority }])
      return textResult(JSON.stringify(item, null, 2))
    }
  )

  server.tool(
    'backlog.update',
    'Update a backlog item\'s status or other properties',
    {
      project_id: z.string().describe('The project ID'),
      item_id: z.string().describe('The backlog item ID'),
      type: z.enum(['idea', 'bug', 'feature']).optional().describe('Updated type'),
      title: z.string().optional().describe('Updated title'),
      description: z.string().optional().describe('Updated description'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Updated priority'),
      status: z.enum(['todo', 'in_progress', 'done', 'closed']).optional().describe('New status'),
    },
    async ({ project_id, item_id, ...patch }) => {
      const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      const updated = await call('backlog.update', [project_id, item_id, filtered])
      if (!updated) return textResult(`Backlog item ${item_id} not found`, true)
      return textResult(JSON.stringify(updated, null, 2))
    }
  )

  server.tool(
    'backlog.delete',
    'Delete a backlog item from a project',
    {
      project_id: z.string().describe('The project ID'),
      item_id: z.string().describe('The backlog item ID to delete'),
    },
    async ({ project_id, item_id }) => {
      await call('backlog.delete', [project_id, item_id])
      return textResult(`Backlog item ${item_id} deleted`)
    }
  )

  // ── Transition tools ────────────────────────────────────────────────────

  server.tool(
    'milestones.transition',
    'Transition a milestone to a new status via a state-machine action (e.g. approve, cancel, close)',
    {
      project_id: z.string().describe('The project ID'),
      milestone_id: z.string().describe('The milestone ID'),
      action: z.enum(['approve', 'cancel', 'close', 'accept', 'rollback', 'reopen']).describe('The transition action to perform'),
    },
    async ({ project_id, milestone_id, action }) => {
      try {
        await call('milestones.transition', [project_id, milestone_id, { action }])
        return textResult(`Milestone ${milestone_id} transitioned via action: ${action}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return textResult(`Transition failed: ${msg}`, true)
      }
    }
  )

  // ── Agent tools ─────────────────────────────────────────────────────────

  server.tool(
    'agents.list',
    'List all available agent definitions (id, name, description)',
    {},
    async () => {
      const agents = await call('agents:list')
      return textResult(JSON.stringify(agents, null, 2))
    }
  )

  server.tool(
    'milestones.assignAgent',
    'Assign an agent to a milestone by adding its ID to the assignees list',
    {
      milestone_id: z.string().describe('The milestone ID'),
      agent_id: z.string().describe('The agent ID to assign'),
    },
    async ({ milestone_id, agent_id }) => {
      await call('milestones.assignAgent', [milestone_id, agent_id])
      return textResult(`Agent ${agent_id} assigned to milestone ${milestone_id}`)
    }
  )

  return server
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const MCP_PORT = 24817 // "ANIMA" on phone keypad :)

export function startMcpHttpServer(routes: Record<string, ApiHandler>): http.Server {
  // Map of session ID → transport (for stateful sessions)
  const transports = new Map<string, StreamableHTTPServerTransport>()

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${MCP_PORT}`)

    if (url.pathname !== '/mcp') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    // Handle GET for SSE stream (session resumption)
    if (req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid or missing session ID' }))
        return
      }
      const transport = transports.get(sessionId)!
      await transport.handleRequest(req, res)
      return
    }

    // Handle DELETE for session termination
    if (req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!
        await transport.handleRequest(req, res)
        transports.delete(sessionId)
      } else {
        res.writeHead(200)
        res.end()
      }
      return
    }

    // Handle POST for MCP messages
    if (req.method === 'POST') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (sessionId && transports.has(sessionId)) {
        // Existing session
        const transport = transports.get(sessionId)!
        await transport.handleRequest(req, res)
      } else {
        // New session — each session needs its own McpServer instance
        // because McpServer only supports a single transport connection
        const mcpServer = createMcpServer(routes)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        })
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId)
          }
        }
        await mcpServer.connect(transport)
        await transport.handleRequest(req, res)
        if (transport.sessionId) {
          transports.set(transport.sessionId, transport)
        }
      }
      return
    }

    res.writeHead(405)
    res.end('Method Not Allowed')
  })

  httpServer.listen(MCP_PORT, '127.0.0.1', () => {
    log.info('MCP HTTP server listening', { port: MCP_PORT })
  })

  httpServer.on('error', (err) => {
    log.error('MCP HTTP server error', { error: String(err) })
  })

  return httpServer
}

export { MCP_PORT }
