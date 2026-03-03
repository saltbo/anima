#!/usr/bin/env node
/**
 * Anima MCP Server — standalone process spawned by Claude Code CLI.
 * Provides tools for agents to read/write milestone data.
 *
 * This is an adapter layer (like IPC handlers). It delegates all business
 * logic to the same Repository classes used by the Electron main process.
 * The only difference: it creates its own DB connection from ANIMA_DB_PATH.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { MilestoneRepository } from '../repositories/MilestoneRepository'
import { CommentRepository } from '../repositories/CommentRepository'
import type { AcceptanceCriterionStatus } from '../../../src/types/index'

// ── DB connection ────────────────────────────────────────────────────────────

function openDb(): Database.Database {
  const dbPath = process.env.ANIMA_DB_PATH
  if (!dbPath) {
    throw new Error('ANIMA_DB_PATH environment variable is required')
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
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

let milestoneRepo: MilestoneRepository
let commentRepo: CommentRepository

// ── Tools ────────────────────────────────────────────────────────────────────

server.tool(
  'get_milestone',
  'Get milestone details including title, description, acceptance criteria, tasks, and iterations',
  { milestone_id: z.string().describe('The milestone ID') },
  async ({ milestone_id }) => {
    const milestone = milestoneRepo.getById(milestone_id)
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
    const comments = commentRepo.getByMilestoneId(milestone_id)
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
    commentRepo.add({
      id,
      milestoneId: milestone_id,
      body,
      author: 'system',
      createdAt: now,
      updatedAt: now,
    })
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
    const updated = milestoneRepo.mergeAcceptanceCriteria(
      milestone_id,
      criteria as Array<{ title: string; status: AcceptanceCriterionStatus; description?: string }>,
      iteration
    )
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
    const updated = milestoneRepo.mergeTasks(milestone_id, tasks, iteration)
    if (!updated) {
      return { content: [{ type: 'text' as const, text: `Milestone ${milestone_id} not found` }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: `Updated ${tasks.length} tasks` }] }
  }
)

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = openDb()
  milestoneRepo = new MilestoneRepository(db)
  commentRepo = new CommentRepository(db)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Anima MCP Server running on stdio')
}

main().catch((error) => {
  console.error('Fatal error in Anima MCP Server:', error)
  process.exit(1)
})
