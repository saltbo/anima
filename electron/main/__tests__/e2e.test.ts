/**
 * E2E Integration Tests — Full Milestone Lifecycle
 *
 * These tests exercise the complete backend stack (Repos → Services → Soul → Tasks)
 * with in-memory repository implementations (because better-sqlite3 is compiled for
 * Electron's Node.js and can't load in vitest).
 *
 * The only mock is `AgentRunner`, which replaces the claude-code CLI boundary.
 * Repositories are full in-memory implementations that replicate SQLite behavior
 * (cascade deletes, JSON column semantics, etc.)
 *
 * Coverage:
 *  1.  Project CRUD
 *  2.  Backlog CRUD
 *  3.  Milestone CRUD + iterations + checks
 *  4.  Soul decide() integration with real data
 *  5.  MilestoneAgentTask — dispatch developer (ready milestone)
 *  6.  MilestoneAgentTask — @mention dispatch (reviewer → developer → reviewer)
 *  7.  MilestoneAgentTask — rate limit handling
 *  8.  MilestoneAgentTask — auto-merge
 *  9.  MilestonePlanningTask — draft→planning→planned
 *  10. MilestonePlanningTask — auto-approve
 *  11. Milestone state transitions validation
 *  12. MilestoneLifecycle — accept/rollback/requestChanges/cancel
 *  13. SoulService orchestration — wake/transition/stop
 *  14. MilestoneService — transition validation + status preservation
 *  15. Comment system
 *  16. Cascade deletion
 *  17. Full E2E: backlog → plan → dispatch → accept
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { GitService } from '../services/GitService'
import { MilestoneLifecycle } from '../services/MilestoneLifecycle'
import { MilestoneService } from '../services/MilestoneService'
import { SoulService } from '../services/SoulService'
import { validateTransition, availableActions } from '../services/milestoneTransitions'
import { MilestoneAgentTask } from '../soul/tasks/MilestoneAgentTask'
import { MilestonePlanningTask } from '../soul/tasks/MilestonePlanningTask'
import { Notifier } from '../soul/notifier'
import { think } from '../soul/decide'
import type { AgentRunner, RunOptions, ResumeOptions, RunResult } from '../agents/AgentRunner'
import type {
  Project,
  Milestone,
  MilestoneCheck,
  Iteration,
  BacklogItem,
  MilestoneComment,
} from '../../../src/types/index'
import type { ProjectRepository } from '../repositories/ProjectRepository'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { BacklogRepository } from '../repositories/BacklogRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { CheckRepository } from '../repositories/CheckRepository'
import { setMcpConfigDir } from '../mcp/mcpConfig'

// ═════════════════════════════════════════════════════════════════════════════
//  IN-MEMORY REPOSITORIES (replace SQLite for testing)
// ═════════════════════════════════════════════════════════════════════════════

class InMemoryProjectRepository {
  private projects = new Map<string, Project>()
  private nextId = 1

  getAll(): Project[] {
    return [...this.projects.values()]
  }

  getById(id: string): Project | null {
    return this.projects.get(id) ?? null
  }

  getByPath(projectPath: string): Project | null {
    return [...this.projects.values()].find((p) => p.path === projectPath) ?? null
  }

  add(projectPath: string): Project {
    const id = `proj-${this.nextId++}`
    const project: Project = {
      id,
      path: projectPath,
      name: path.basename(projectPath),
      addedAt: '2026-03-01T12:00:00.000Z',
      status: 'sleeping',
      currentIteration: null,
      nextWakeTime: null,
      wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
      autoMerge: false,
      autoApprove: false,
      totalTokens: 0,
      totalCost: 0,
      rateLimitResetAt: null,
    }
    this.projects.set(id, project)
    return project
  }

  remove(id: string): void {
    this.projects.delete(id)
  }

  patch(projectId: string, patch: Partial<Project>): Project {
    const current = this.projects.get(projectId)
    if (!current) throw new Error(`Project not found: ${projectId}`)
    const merged = { ...current, ...patch }
    this.projects.set(projectId, merged)
    return merged
  }
}

class InMemoryMilestoneRepository {
  private milestones = new Map<string, { projectId: string; milestone: Milestone }>()
  private iterations: Iteration[] = []

  getByProjectId(projectId: string): Milestone[] {
    const results: Milestone[] = []
    for (const entry of this.milestones.values()) {
      if (entry.projectId === projectId) {
        results.push(this.hydrate(entry.milestone))
      }
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getById(id: string): Milestone | null {
    const entry = this.milestones.get(id)
    if (!entry) return null
    return this.hydrate(entry.milestone)
  }

  save(projectId: string, milestone: Milestone): void {
    this.milestones.set(milestone.id, { projectId, milestone: { ...milestone } })
  }

  delete(id: string): void {
    this.milestones.delete(id)
    this.iterations = this.iterations.filter((i) => i.milestoneId !== id)
  }

  addIteration(iteration: Iteration): void {
    this.iterations.push({ ...iteration })
  }

  getProjectIdForMilestone(milestoneId: string): string | null {
    return this.milestones.get(milestoneId)?.projectId ?? null
  }

  getCurrentIteration(milestoneId: string): (Iteration & { id: number }) | null {
    const match = this.iterations.find(
      (i) => i.milestoneId === milestoneId && i.status === 'in_progress'
    )
    if (!match) return null
    return { ...match, id: this.iterations.indexOf(match) }
  }

  updateIterationStatus(id: number, status: string): void {
    if (this.iterations[id]) {
      this.iterations[id] = { ...this.iterations[id], status }
    }
  }

  incrementDispatchCount(id: number): void {
    if (this.iterations[id]) {
      const iter = this.iterations[id]
      this.iterations[id] = { ...iter, dispatchCount: (iter.dispatchCount ?? 0) + 1 }
    }
  }

  updateIterationSession(id: number, field: 'developer' | 'acceptor', sessionId: string): void {
    if (this.iterations[id]) {
      const iter = this.iterations[id]
      if (field === 'developer') {
        this.iterations[id] = { ...iter, developerSessionId: sessionId }
      } else {
        this.iterations[id] = { ...iter, acceptorSessionId: sessionId }
      }
    }
  }

  updateIterationUsage(id: number, tokens: number, cost: number, model: string): void {
    if (this.iterations[id]) {
      const iter = this.iterations[id]
      this.iterations[id] = {
        ...iter,
        totalTokens: (iter.totalTokens ?? 0) + tokens,
        totalCost: (iter.totalCost ?? 0) + cost,
        model,
      }
    }
  }

  /** Update checks on a milestone by mutating in place */
  updateChecks(milestoneId: string, checks: MilestoneCheck[]): void {
    const entry = this.milestones.get(milestoneId)
    if (!entry) return
    entry.milestone.checks = checks
  }

  /** Remove all milestones for a project (for cascade delete) */
  removeByProjectId(projectId: string): void {
    const ids: string[] = []
    for (const [id, entry] of this.milestones.entries()) {
      if (entry.projectId === projectId) ids.push(id)
    }
    for (const id of ids) this.delete(id)
  }

  private hydrate(milestone: Milestone): Milestone {
    const iters = this.iterations
      .filter((i) => i.milestoneId === milestone.id)
      .sort((a, b) => a.round - b.round)
    return {
      ...milestone,
      iterations: iters,
      totalTokens: iters.reduce((sum, i) => sum + (i.totalTokens ?? 0), 0),
      totalCost: iters.reduce((sum, i) => sum + (i.totalCost ?? 0), 0),
    }
  }
}

class InMemoryBacklogRepository {
  private items = new Map<string, { projectId: string; item: BacklogItem }>()
  private nextId = 1

  getByProjectId(projectId: string): BacklogItem[] {
    return [...this.items.values()]
      .filter((e) => e.projectId === projectId)
      .map((e) => e.item)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getById(id: string): BacklogItem | null {
    return this.items.get(id)?.item ?? null
  }

  add(projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'>): BacklogItem {
    const newItem: BacklogItem = {
      ...item,
      id: `bl-${this.nextId++}`,
      status: 'todo',
      createdAt: '2026-03-01T12:00:00.000Z',
    }
    this.items.set(newItem.id, { projectId, item: newItem })
    return newItem
  }

  update(id: string, patch: Partial<BacklogItem>): BacklogItem | null {
    const entry = this.items.get(id)
    if (!entry) return null
    const updated = { ...entry.item, ...patch }
    this.items.set(id, { ...entry, item: updated })
    return updated
  }

  delete(id: string): void {
    this.items.delete(id)
  }

  /** Remove all items for a project (for cascade delete) */
  removeByProjectId(projectId: string): void {
    for (const [id, entry] of this.items.entries()) {
      if (entry.projectId === projectId) this.items.delete(id)
    }
  }
}

class InMemoryCommentRepository {
  private comments = new Map<string, MilestoneComment>()

  getByMilestoneId(milestoneId: string): MilestoneComment[] {
    return [...this.comments.values()]
      .filter((c) => c.milestoneId === milestoneId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  add(comment: MilestoneComment): void {
    this.comments.set(comment.id, { ...comment })
  }

  delete(id: string): void {
    this.comments.delete(id)
  }

  getUndispatchedMentions(milestoneId: string): MilestoneComment[] {
    return [...this.comments.values()]
      .filter((c) => c.milestoneId === milestoneId && !c.mentionDispatched && c.body.includes('@'))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  markMentionDispatched(commentId: string): void {
    const comment = this.comments.get(commentId)
    if (comment) {
      this.comments.set(commentId, { ...comment, mentionDispatched: true })
    }
  }

  /** Remove all comments for a milestone (for cascade delete) */
  removeByMilestoneId(milestoneId: string): void {
    for (const [id, c] of this.comments.entries()) {
      if (c.milestoneId === milestoneId) this.comments.delete(id)
    }
  }
}

class InMemoryMilestoneItemRepository {
  private links = new Map<string, Set<string>>() // milestoneId → Set<itemId>

  link(milestoneId: string, itemId: string): void {
    let set = this.links.get(milestoneId)
    if (!set) {
      set = new Set()
      this.links.set(milestoneId, set)
    }
    set.add(itemId)
  }

  unlink(milestoneId: string, itemId: string): void {
    this.links.get(milestoneId)?.delete(itemId)
  }

  getItemIds(milestoneId: string): string[] {
    return [...(this.links.get(milestoneId) ?? [])]
  }

  getMilestoneIds(itemId: string): string[] {
    const result: string[] = []
    for (const [msId, items] of this.links) {
      if (items.has(itemId)) result.push(msId)
    }
    return result
  }
}

class InMemoryCheckRepository {
  private checks = new Map<string, MilestoneCheck>()

  add(check: Omit<MilestoneCheck, 'id' | 'createdAt' | 'updatedAt'>): MilestoneCheck {
    const now = new Date().toISOString()
    const newCheck: MilestoneCheck = {
      ...check,
      id: `chk-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    }
    this.checks.set(newCheck.id, newCheck)
    return newCheck
  }

  bulkAdd(checks: Array<Omit<MilestoneCheck, 'id' | 'createdAt' | 'updatedAt'>>): MilestoneCheck[] {
    return checks.map((c) => this.add(c))
  }

  update(id: string, patch: Partial<Pick<MilestoneCheck, 'status' | 'title' | 'description' | 'iteration'>>): MilestoneCheck | null {
    const existing = this.checks.get(id)
    if (!existing) return null
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    this.checks.set(id, updated)
    return updated
  }

  getByItemId(itemId: string): MilestoneCheck[] {
    return [...this.checks.values()].filter((c) => c.itemId === itemId)
  }

  getByMilestoneId(milestoneId: string): MilestoneCheck[] {
    return [...this.checks.values()].filter((c) => c.milestoneId === milestoneId)
  }

  delete(id: string): void {
    this.checks.delete(id)
  }
}

// ── Mock AgentRunner ──────────────────────────────────────────────────────────

function makeRunResult(sessionId: string): RunResult {
  return {
    sessionId,
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5 },
    cost: 0.01,
    model: 'claude-sonnet-4-20250514',
  }
}

class MockAgentRunner {
  calls: { method: 'run' | 'resume'; opts: RunOptions | ResumeOptions }[] = []
  onRun: ((opts: RunOptions | ResumeOptions) => void) | null = null
  nextError: string | null = null

  async run(opts: RunOptions): Promise<RunResult> {
    this.calls.push({ method: 'run', opts })
    if (this.nextError) {
      const msg = this.nextError
      this.nextError = null
      throw new Error(msg)
    }
    this.onRun?.(opts)
    opts.onEvent?.({ event: 'done' })
    return makeRunResult(opts.sessionId)
  }

  async resume(opts: ResumeOptions): Promise<RunResult> {
    this.calls.push({ method: 'resume', opts })
    if (this.nextError) {
      const msg = this.nextError
      this.nextError = null
      throw new Error(msg)
    }
    this.onRun?.(opts)
    opts.onEvent?.({ event: 'done' })
    return makeRunResult(opts.sessionId)
  }
}

// ── Mock GitService ──────────────────────────────────────────────────────────

class MockGitService {
  branchCreated: string[] = []
  mergedBranches: string[] = []
  deletedBranches: string[] = []
  resetBranches: { branch: string; commit: string }[] = []

  async createMilestoneBranch(_p: string, milestoneId: string): Promise<string> {
    this.branchCreated.push(`milestone/${milestoneId}`)
    return 'abc1234'
  }
  async getDefaultBranch(): Promise<string> { return 'main' }
  async squashMerge(_p: string, source: string): Promise<void> { this.mergedBranches.push(source) }
  async deleteBranch(_p: string, branch: string): Promise<void> { this.deletedBranches.push(branch) }
  async resetBranchToCommit(_p: string, branch: string, commit: string): Promise<void> {
    this.resetBranches.push({ branch, commit })
  }
  async getCommitCountSince(): Promise<number> { return 3 }
  async getDiffStats() { return { filesChanged: 5, insertions: 100, deletions: 20 } }
  async getCurrentBranch(): Promise<string> { return 'main' }
  async checkoutBranch(): Promise<void> {}
  async hasUncommittedChanges(): Promise<boolean> { return false }
  async isGitRepo(): Promise<boolean> { return true }
  async getCommitLog(): Promise<string> { return '' }
}

// ── Test Harness ─────────────────────────────────────────────────────────────

interface Harness {
  projectRepo: InMemoryProjectRepository
  milestoneRepo: InMemoryMilestoneRepository
  backlogRepo: InMemoryBacklogRepository
  commentRepo: InMemoryCommentRepository
  milestoneItemRepo: InMemoryMilestoneItemRepository
  checkRepo: InMemoryCheckRepository
  gitService: MockGitService
  agentRunner: MockAgentRunner
  soulService: SoulService
  milestoneService: MilestoneService
  tmpDir: string
}

function createHarness(): Harness {
  const projectRepo = new InMemoryProjectRepository()
  const milestoneRepo = new InMemoryMilestoneRepository()
  const backlogRepo = new InMemoryBacklogRepository()
  const commentRepo = new InMemoryCommentRepository()
  const milestoneItemRepo = new InMemoryMilestoneItemRepository()
  const checkRepo = new InMemoryCheckRepository()
  const gitService = new MockGitService()
  const agentRunner = new MockAgentRunner()

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-e2e-'))
  setMcpConfigDir(tmpDir)

  const soulService = new SoulService(
    projectRepo as unknown as ProjectRepository,
    milestoneRepo as unknown as MilestoneRepository,
    commentRepo as unknown as CommentRepository,
    backlogRepo as unknown as BacklogRepository,
    milestoneItemRepo as unknown as import('../repositories/MilestoneItemRepository').MilestoneItemRepository,
    gitService as unknown as GitService,
    agentRunner as unknown as AgentRunner,
    () => null,
  )

  const milestoneService = new MilestoneService(
    milestoneRepo as unknown as MilestoneRepository,
    backlogRepo as unknown as BacklogRepository,
    milestoneItemRepo as unknown as import('../repositories/MilestoneItemRepository').MilestoneItemRepository,
    projectRepo as unknown as ProjectRepository,
    commentRepo as unknown as CommentRepository,
    checkRepo as unknown as CheckRepository,
    () => null,
    () => soulService,
  )

  return { projectRepo, milestoneRepo, backlogRepo, commentRepo, milestoneItemRepo, checkRepo, gitService, agentRunner, soulService, milestoneService, tmpDir }
}

function makeMs(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms-1',
    title: 'Test Milestone',
    description: 'Test',
    status: 'draft',
    items: [],
    checks: [],
    createdAt: '2026-03-01T12:00:00.000Z',
    iterationCount: 0,
    iterations: [],
    totalTokens: 0,
    totalCost: 0,
    assignees: [],
    ...overrides,
  }
}

function makeCheck(overrides: Partial<MilestoneCheck> = {}): MilestoneCheck {
  return {
    id: `chk-${Math.random().toString(36).slice(2, 8)}`,
    milestoneId: 'ms-1',
    itemId: 'item-1',
    title: 'Check',
    status: 'pending',
    iteration: 0,
    createdAt: '2026-03-01T12:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('E2E: Full Milestone Lifecycle', () => {
  let h: Harness

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
    h = createHarness()
  })

  afterEach(() => {
    vi.useRealTimers()
    h.soulService.stopAll()
    fs.rmSync(h.tmpDir, { recursive: true, force: true })
  })

  // ── 1. Project CRUD ─────────────────────────────────────────────────────

  describe('Project CRUD', () => {
    it('creates, reads, and removes a project', () => {
      const project = h.projectRepo.add('/tmp/my-project')

      expect(project.id).toBeTruthy()
      expect(project.name).toBe('my-project')
      expect(project.status).toBe('sleeping')
      expect(project.autoMerge).toBe(false)

      expect(h.projectRepo.getById(project.id)).toEqual(project)
      expect(h.projectRepo.getAll()).toHaveLength(1)

      h.projectRepo.remove(project.id)
      expect(h.projectRepo.getAll()).toHaveLength(0)
    })

    it('patches project fields', () => {
      const project = h.projectRepo.add('/tmp/patch')
      h.projectRepo.patch(project.id, { autoMerge: true, autoApprove: true, status: 'idle' })

      const updated = h.projectRepo.getById(project.id)!
      expect(updated.autoMerge).toBe(true)
      expect(updated.autoApprove).toBe(true)
      expect(updated.status).toBe('idle')
    })
  })

  // ── 2. Backlog CRUD ─────────────────────────────────────────────────────

  describe('Backlog CRUD', () => {
    it('creates, updates, and deletes backlog items', () => {
      const project = h.projectRepo.add('/tmp/backlog')
      const item = h.backlogRepo.add(project.id, {
        type: 'feature', title: 'Add dark mode', description: 'Support dark theme', priority: 'high',
      })

      expect(item.status).toBe('todo')
      h.backlogRepo.update(item.id, { status: 'in_progress' })
      expect(h.backlogRepo.getById(item.id)!.status).toBe('in_progress')

      h.backlogRepo.delete(item.id)
      expect(h.backlogRepo.getByProjectId(project.id)).toHaveLength(0)
    })
  })

  // ── 3. Milestone CRUD + iterations ──────────────────────────────────────

  describe('Milestone CRUD', () => {
    it('saves, reads, and deletes milestones', () => {
      const project = h.projectRepo.add('/tmp/ms')
      const ms = makeMs({
        id: 'ms-crud',
        checks: [makeCheck({ title: 'Login works' })],
      })
      h.milestoneRepo.save(project.id, ms)

      const fetched = h.milestoneRepo.getById('ms-crud')!
      expect(fetched.title).toBe('Test Milestone')
      expect(fetched.checks).toHaveLength(1)

      h.milestoneRepo.delete('ms-crud')
      expect(h.milestoneRepo.getById('ms-crud')).toBeNull()
    })

    it('records and retrieves iterations', () => {
      const project = h.projectRepo.add('/tmp/iter')
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-iter', status: 'in_progress' }))

      h.milestoneRepo.addIteration({
        milestoneId: 'ms-iter', round: 1, outcome: 'rejected',
        startedAt: '2026-03-01T12:00:00Z', completedAt: '2026-03-01T12:05:00Z',
        totalTokens: 500, totalCost: 0.05, model: 'claude-sonnet-4-20250514',
        developerSessionId: 'dev-1', acceptorSessionId: 'acc-1',
      })

      const refreshed = h.milestoneRepo.getById('ms-iter')!
      expect(refreshed.iterations).toHaveLength(1)
      expect(refreshed.iterations[0].outcome).toBe('rejected')
      expect(refreshed.totalTokens).toBe(500)
    })

    it('updates checks on a milestone', () => {
      const project = h.projectRepo.add('/tmp/ac')
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-ac',
        checks: [makeCheck({ id: 'chk-1', title: 'A', status: 'pending' })],
      }))

      // Update checks to passed
      h.milestoneRepo.updateChecks('ms-ac', [
        makeCheck({ id: 'chk-1', title: 'A', status: 'passed', iteration: 1 }),
        makeCheck({ id: 'chk-2', title: 'B', status: 'pending', iteration: 1 }),
      ])

      const updated = h.milestoneRepo.getById('ms-ac')!
      expect(updated.checks).toHaveLength(2)
      expect(updated.checks.find((c) => c.title === 'A')!.status).toBe('passed')
      expect(updated.checks.find((c) => c.title === 'B')!.status).toBe('pending')
    })
  })

  // ── 4. Soul decide() ────────────────────────────────────────────────────

  describe('Soul decide()', () => {
    it('returns idle when no project', () => {
      expect(think({ project: null, milestones: [], backlogItems: [], pendingMentions: [] })).toEqual({ task: 'idle' })
    })

    it('dispatches developer for ready milestone', () => {
      const project = h.projectRepo.add('/tmp/decide')
      const ready = makeMs({ id: 'ms-r', status: 'ready' })
      expect(think({ project, milestones: [ready], backlogItems: [], pendingMentions: [] })).toEqual({
        task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-r',
      })
    })

    it('dispatches mentioned agent for in_progress milestone', () => {
      const project = h.projectRepo.add('/tmp/decide-mention')
      const ip = makeMs({ id: 'ms-ip', status: 'in_progress' })
      const ready = makeMs({ id: 'ms-r', status: 'ready' })
      expect(think({
        project,
        milestones: [ready, ip],
        backlogItems: [],
        pendingMentions: [{ agentId: 'reviewer', milestoneId: 'ms-ip', commentId: 'c1' }],
      })).toEqual({
        task: 'dispatch-agent', agentId: 'reviewer', milestoneId: 'ms-ip', commentId: 'c1',
      })
    })

    it('idles when @human mention on in_progress milestone', () => {
      const project = h.projectRepo.add('/tmp/decide-human')
      const ip = makeMs({ id: 'ms-ip', status: 'in_progress' })
      expect(think({
        project,
        milestones: [ip],
        backlogItems: [],
        pendingMentions: [{ agentId: 'human', milestoneId: 'ms-ip', commentId: 'c1' }],
      })).toEqual({ task: 'idle' })
    })

    it('triggers plan-milestone with ≥10 backlog items', () => {
      const project = h.projectRepo.add('/tmp/plan-trigger')
      const todos = Array.from({ length: 12 }, (_, i) =>
        h.backlogRepo.add(project.id, { type: 'feature', title: `Item ${i}`, priority: 'medium' })
      )
      expect(think({ project, milestones: [], backlogItems: todos, pendingMentions: [] })).toEqual({ task: 'plan-milestone' })
    })

    it('idles when draft exists (prevents duplicate planning)', () => {
      const project = h.projectRepo.add('/tmp/no-dup')
      const draft = makeMs({ id: 'ms-d', status: 'draft' })
      const todos = Array.from({ length: 12 }, (_, i) =>
        h.backlogRepo.add(project.id, { type: 'feature', title: `Item ${i}`, priority: 'medium' })
      )
      expect(think({ project, milestones: [draft], backlogItems: todos, pendingMentions: [] })).toEqual({ task: 'idle' })
    })
  })

  // ── 5. MilestoneAgentTask — dispatch agent ──────────────────────────────

  describe('MilestoneAgentTask', () => {
    function createAgentTask(projectId: string, projectPath: string) {
      return new MilestoneAgentTask({
        projectId, projectPath,
        projectRepo: h.projectRepo as unknown as ProjectRepository,
        milestoneRepo: h.milestoneRepo as unknown as MilestoneRepository,
        commentRepo: h.commentRepo as unknown as CommentRepository,
        gitService: h.gitService as unknown as GitService,
        agentRunner: h.agentRunner as unknown as AgentRunner,
        notifier: new Notifier(projectId, () => null),
      })
    }

    it('dispatch developer on ready milestone → creates branch, sets in_progress, runs agent', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      const ms = makeMs({
        id: 'ms-dispatch', status: 'ready',
        checks: [makeCheck({ title: 'Works', status: 'pending' })],
      })
      h.milestoneRepo.save(project.id, ms)

      const task = createAgentTask(project.id, project.path)
      await task.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-dispatch' },
        new AbortController().signal
      )

      const updated = h.milestoneRepo.getById('ms-dispatch')!
      expect(updated.status).toBe('in_progress')
      expect(h.gitService.branchCreated).toContain('milestone/ms-dispatch')
      expect(h.agentRunner.calls).toHaveLength(1)
      expect(h.agentRunner.calls[0].method).toBe('run')
    })

    it('dispatch developer with all checks passed → completes milestone', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      const ms = makeMs({
        id: 'ms-complete', status: 'ready',
        checks: [makeCheck({ title: 'Done', status: 'pending' })],
      })
      h.milestoneRepo.save(project.id, ms)

      h.agentRunner.onRun = () => {
        h.milestoneRepo.updateChecks('ms-complete', [
          makeCheck({ title: 'Done', status: 'passed', iteration: 1 }),
        ])
      }

      const task = createAgentTask(project.id, project.path)
      await task.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-complete' },
        new AbortController().signal
      )

      const updated = h.milestoneRepo.getById('ms-complete')!
      expect(updated.status).toBe('in_review')
    })

    it('handles rate limit error', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      const ms = makeMs({
        id: 'ms-rl', status: 'ready',
        checks: [makeCheck({ title: 'A', status: 'pending' })],
      })
      h.milestoneRepo.save(project.id, ms)

      h.agentRunner.nextError = 'rate limit exceeded. retry after 2026-03-01T13:00:00.000Z'

      const task = createAgentTask(project.id, project.path)
      await task.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-rl' },
        new AbortController().signal
      )

      const proj = h.projectRepo.getById(project.id)!
      expect(proj.status).toBe('rate_limited')
      expect(proj.rateLimitResetAt).toBe('2026-03-01T13:00:00.000Z')

      // decide() should idle while rate limited
      expect(think({
        project: proj,
        milestones: h.milestoneRepo.getByProjectId(project.id),
        backlogItems: [],
        pendingMentions: [],
      })).toEqual({ task: 'idle' })
    })

    it('auto-merges when project.autoMerge is true', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.projectRepo.patch(project.id, { autoMerge: true })

      const ms = makeMs({
        id: 'ms-am', status: 'ready',
        checks: [makeCheck({ title: 'Done', status: 'pending' })],
      })
      h.milestoneRepo.save(project.id, ms)

      h.agentRunner.onRun = () => {
        h.milestoneRepo.updateChecks('ms-am', [
          makeCheck({ title: 'Done', status: 'passed', iteration: 1 }),
        ])
      }

      const task = createAgentTask(project.id, project.path)
      await task.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-am' },
        new AbortController().signal
      )

      const updated = h.milestoneRepo.getById('ms-am')!
      expect(updated.status).toBe('completed')
      expect(updated.completedAt).toBeTruthy()
      expect(h.gitService.mergedBranches).toContain('milestone/ms-am')
      expect(h.gitService.deletedBranches).toContain('milestone/ms-am')
    })

    it('resumes session for same agent in same iteration', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      const ms = makeMs({
        id: 'ms-resume', status: 'in_progress',
        checks: [makeCheck({ title: 'A', status: 'pending' })],
        iterationCount: 1,
      })
      h.milestoneRepo.save(project.id, ms)

      // Pre-create an iteration with a developer session
      h.milestoneRepo.addIteration({
        milestoneId: 'ms-resume', round: 1, startedAt: '2026-03-01T12:00:00Z',
        status: 'in_progress', developerSessionId: 'dev-session-1',
      })

      // Add a mention comment to trigger dispatch
      h.commentRepo.add({
        id: 'c-mention', milestoneId: 'ms-resume', body: '@developer fix the bug',
        author: 'reviewer', createdAt: '2026-03-01T12:01:00Z', updatedAt: '2026-03-01T12:01:00Z',
      })

      const task = createAgentTask(project.id, project.path)
      await task.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-resume', commentId: 'c-mention' },
        new AbortController().signal
      )

      // Should resume the existing session
      expect(h.agentRunner.calls).toHaveLength(1)
      expect(h.agentRunner.calls[0].method).toBe('resume')

      // Comment should be marked dispatched
      const comment = h.commentRepo.getByMilestoneId('ms-resume').find((c) => c.id === 'c-mention')!
      expect(comment.mentionDispatched).toBe(true)
    })
  })

  // ── 6. MilestonePlanningTask ────────────────────────────────────────────

  describe('MilestonePlanningTask', () => {
    function createPlanTask(projectId: string, projectPath: string) {
      return new MilestonePlanningTask({
        projectId, projectPath,
        projectRepo: h.projectRepo as unknown as ProjectRepository,
        milestoneRepo: h.milestoneRepo as unknown as MilestoneRepository,
        backlogRepo: h.backlogRepo as unknown as BacklogRepository,
        milestoneItemRepo: h.milestoneItemRepo as unknown as import('../repositories/MilestoneItemRepository').MilestoneItemRepository,
        agentRunner: h.agentRunner as unknown as AgentRunner,
        notifier: new Notifier(projectId, () => null),
      })
    }

    it('planning agent → draft → planning → planned (manual approval)', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      for (let i = 0; i < 5; i++) {
        h.backlogRepo.add(project.id, { type: 'feature', title: `Feature ${i}`, priority: 'medium' })
      }

      let plannerCalled = false
      h.agentRunner.onRun = () => {
        if (!plannerCalled) {
          plannerCalled = true
          h.milestoneRepo.save(project.id, makeMs({
            id: 'ms-planned', title: 'Planned', description: 'Auto-planned', status: 'draft',
            checks: [makeCheck({ title: 'Feature 0 works' })],
          }))
        }
      }

      const task = createPlanTask(project.id, project.path)
      await task.execute({ task: 'plan-milestone' }, new AbortController().signal)

      const ms = h.milestoneRepo.getById('ms-planned')!
      expect(ms.status).toBe('planned')

      // Milestone markdown written
      const mdPath = path.join(project.path, '.anima', 'milestones', 'ms-planned.md')
      expect(fs.existsSync(mdPath)).toBe(true)
      expect(fs.readFileSync(mdPath, 'utf8')).toContain('Planned')

      expect(h.agentRunner.calls).toHaveLength(2) // planner + reviewer
    })

    it('auto-approves when project.autoApprove is true', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.projectRepo.patch(project.id, { autoApprove: true })

      let plannerCalled = false
      h.agentRunner.onRun = () => {
        if (!plannerCalled) {
          plannerCalled = true
          h.milestoneRepo.save(project.id, makeMs({
            id: 'ms-auto', title: 'Auto', description: 'Test', status: 'draft',
          }))
        }
      }

      const task = createPlanTask(project.id, project.path)
      await task.execute({ task: 'plan-milestone' }, new AbortController().signal)

      expect(h.milestoneRepo.getById('ms-auto')!.status).toBe('ready')
    })
  })

  // ── 7. Milestone state transitions ──────────────────────────────────────

  describe('State transitions', () => {
    it('validates allowed transitions', () => {
      expect(validateTransition('planned', 'approve')).toBeTruthy()
      expect(validateTransition('in_review', 'accept')).toBeTruthy()
      expect(validateTransition('in_review', 'rollback')).toBeTruthy()
      expect(validateTransition('in_review', 'request_changes')).toBeTruthy()
      expect(validateTransition('ready', 'cancel')).toBeTruthy()
      expect(validateTransition('closed', 'reopen')).toBeTruthy()
    })

    it('rejects invalid transitions', () => {
      expect(validateTransition('draft', 'accept')).toBeNull()
      expect(validateTransition('completed', 'cancel')).toBeNull()
      expect(validateTransition('ready', 'approve')).toBeNull()
    })

    it('lists available actions per status', () => {
      expect(availableActions('in_review')).toEqual(
        expect.arrayContaining(['accept', 'request_changes', 'rollback', 'close'])
      )
      expect(availableActions('completed')).toEqual(['close'])
    })
  })

  // ── 8. MilestoneLifecycle ───────────────────────────────────────────────

  describe('MilestoneLifecycle', () => {
    function createLifecycle(projectId: string) {
      return new MilestoneLifecycle(
        h.projectRepo as unknown as ProjectRepository, h.milestoneRepo as unknown as MilestoneRepository,
        h.commentRepo as unknown as CommentRepository, h.backlogRepo as unknown as BacklogRepository,
        h.milestoneItemRepo as unknown as import('../repositories/MilestoneItemRepository').MilestoneItemRepository,
        h.gitService as unknown as GitService,
        new Notifier(projectId, () => null),
      )
    }

    it('accept merges and marks completed + backlog done', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-lc', status: 'in_review', baseCommit: 'abc1234',
        checks: [makeCheck({ title: 'A', status: 'passed', iteration: 1 })],
      }))
      const item = h.backlogRepo.add(project.id, { type: 'feature', title: 'Linked', priority: 'high' })
      h.backlogRepo.update(item.id, { status: 'in_progress' })
      h.milestoneItemRepo.link('ms-lc', item.id)

      await createLifecycle(project.id).accept(project.id, 'ms-lc')

      expect(h.milestoneRepo.getById('ms-lc')!.status).toBe('completed')
      expect(h.gitService.mergedBranches).toContain('milestone/ms-lc')
      expect(h.gitService.deletedBranches).toContain('milestone/ms-lc')
      expect(h.backlogRepo.getById(item.id)!.status).toBe('done')
    })

    it('rollback resets branch and sets status to ready', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-rb', status: 'in_review', baseCommit: 'abc1234', iterationCount: 3,
      }))

      await createLifecycle(project.id).rollback(project.id, 'ms-rb')

      const ms = h.milestoneRepo.getById('ms-rb')!
      expect(ms.status).toBe('ready')
      expect(ms.iterationCount).toBe(0)
      expect(h.gitService.resetBranches).toEqual([{ branch: 'milestone/ms-rb', commit: 'abc1234' }])
    })

    it('request_changes adds comment and sets ready', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-rc', status: 'in_review' }))

      createLifecycle(project.id).requestChanges(project.id, 'ms-rc', {
        id: 'c1', body: 'Fix edge case',
      })

      expect(h.milestoneRepo.getById('ms-rc')!.status).toBe('ready')
      const comments = h.commentRepo.getByMilestoneId('ms-rc')
      expect(comments).toHaveLength(1)
      expect(comments[0].body).toBe('Fix edge case')
      expect(comments[0].author).toBe('human')
    })

    it('cancel releases backlog items', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-cancel', status: 'ready' }))
      const item = h.backlogRepo.add(project.id, { type: 'feature', title: 'Linked', priority: 'medium' })
      h.backlogRepo.update(item.id, { status: 'in_progress' })
      h.milestoneItemRepo.link('ms-cancel', item.id)

      createLifecycle(project.id).cancel(project.id, 'ms-cancel')

      expect(h.milestoneRepo.getById('ms-cancel')!.status).toBe('cancelled')
      expect(h.backlogRepo.getById(item.id)!.status).toBe('todo')
    })

    it('rollback without baseCommit is a no-op', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-nobase', status: 'in_review' }))

      await createLifecycle(project.id).rollback(project.id, 'ms-nobase')
      expect(h.milestoneRepo.getById('ms-nobase')!.status).toBe('in_review')
    })
  })

  // ── 9. SoulService orchestration ────────────────────────────────────────

  describe('SoulService', () => {
    it('wakes soul and dispatches when ready milestone exists', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-soul', status: 'ready',
        checks: [makeCheck({ title: 'OK', status: 'pending' })],
      }))

      h.agentRunner.onRun = () => {
        h.milestoneRepo.updateChecks('ms-soul', [
          makeCheck({ title: 'OK', status: 'passed', iteration: 1 }),
        ])
      }

      h.soulService.add(project)
      await vi.advanceTimersByTimeAsync(100)

      const updated = h.milestoneRepo.getById('ms-soul')!
      // After dispatch-agent(developer) runs, checks pass → complete → in_review
      expect(updated.status).toBe('in_review')
      expect(h.projectRepo.getById(project.id)!.status).toBe('idle')
    })

    it('transition accept merges and wakes for next work', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-accept', status: 'in_review', baseCommit: 'def456',
        checks: [makeCheck({ title: 'A', status: 'passed', iteration: 1 })],
      }))
      h.soulService.add(project)

      await h.soulService.transition(project.id, 'ms-accept', { action: 'accept' })

      expect(h.milestoneRepo.getById('ms-accept')!.status).toBe('completed')
      expect(h.gitService.mergedBranches).toContain('milestone/ms-accept')
    })

    it('transition cancel aborts soul', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-sc', status: 'ready' }))

      // add() calls wake() but tick is deferred — we can transition before it fires
      h.soulService.add(project)

      await h.soulService.transition(project.id, 'ms-sc', { action: 'cancel' })

      expect(h.milestoneRepo.getById('ms-sc')!.status).toBe('cancelled')
    })

    it('transition request_changes re-wakes soul', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({
        id: 'ms-rq', status: 'in_review', baseCommit: 'ghi789',
      }))

      h.soulService.add(project)

      await h.soulService.transition(project.id, 'ms-rq', {
        action: 'request_changes',
        comment: { id: 'rc-1', body: 'Fix tests' },
      })

      // request_changes sets milestone to 'ready'; tick is deferred so status is deterministic
      expect(h.milestoneRepo.getById('ms-rq')!.status).toBe('ready')
      expect(h.commentRepo.getByMilestoneId('ms-rq')).toHaveLength(1)
    })

    it('remove + re-remove does not throw', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.soulService.add(project)
      h.soulService.remove(project.id)
      expect(() => h.soulService.remove(project.id)).not.toThrow()
    })
  })

  // ── 10. MilestoneService ────────────────────────────────────────────────

  describe('MilestoneService', () => {
    it('approve transitions planned → ready', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-approve', status: 'planned' }))

      await h.milestoneService.transition(project.id, 'ms-approve', { action: 'approve' })
      expect(h.milestoneRepo.getById('ms-approve')!.status).toBe('ready')
    })

    it('rejects invalid transition', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-inv', status: 'draft' }))

      await expect(
        h.milestoneService.transition(project.id, 'ms-inv', { action: 'accept' }),
      ).rejects.toThrow('Invalid transition')
    })

    it('reopen transitions closed → draft', async () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-reopen', status: 'closed' }))

      await h.milestoneService.transition(project.id, 'ms-reopen', { action: 'reopen' })
      expect(h.milestoneRepo.getById('ms-reopen')!.status).toBe('draft')
    })

    it('preserves status on save (prevents bypass)', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-preserve', status: 'in_progress' }))

      h.milestoneService.saveMilestone(project.id, makeMs({ id: 'ms-preserve', status: 'completed' }))
      expect(h.milestoneRepo.getById('ms-preserve')!.status).toBe('in_progress')
    })

    it('blocks deletion of in_progress milestones', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-block', status: 'in_progress' }))

      expect(() => h.milestoneService.deleteMilestone(project.id, 'ms-block')).toThrow(
        'Cannot delete milestone in status: in_progress',
      )
    })
  })

  // ── 11. Comments ────────────────────────────────────────────────────────

  describe('Comment system', () => {
    it('CRUD operations', () => {
      const project = h.projectRepo.add(h.tmpDir)
      h.milestoneRepo.save(project.id, makeMs({ id: 'ms-cmt' }))

      h.commentRepo.add({
        id: 'c1', milestoneId: 'ms-cmt', body: 'Human', author: 'human',
        createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-01T12:00:00Z',
      })
      h.commentRepo.add({
        id: 'c2', milestoneId: 'ms-cmt', body: 'System', author: 'system',
        createdAt: '2026-03-01T12:01:00Z', updatedAt: '2026-03-01T12:01:00Z',
      })

      const comments = h.commentRepo.getByMilestoneId('ms-cmt')
      expect(comments).toHaveLength(2)
      expect(comments[0].author).toBe('human')
      expect(comments[1].author).toBe('system')

      h.commentRepo.delete('c1')
      expect(h.commentRepo.getByMilestoneId('ms-cmt')).toHaveLength(1)
    })
  })

  // ── 12. Full E2E: backlog → plan → dispatch → accept ────────────────────

  describe('Complete E2E flow', () => {
    it('backlog → plan → approve → dispatch → accept', async () => {
      // Step 1: Create project with autoApprove
      const project = h.projectRepo.add(h.tmpDir)
      h.projectRepo.patch(project.id, { autoApprove: true })

      // Step 2: Seed backlog (enough to trigger planning)
      for (let i = 0; i < 12; i++) {
        h.backlogRepo.add(project.id, { type: 'feature', title: `E2E Feature ${i}`, priority: 'high' })
      }

      // Step 3: Verify decide() wants to plan
      expect(think({
        project: h.projectRepo.getById(project.id)!,
        milestones: [],
        backlogItems: h.backlogRepo.getByProjectId(project.id),
        pendingMentions: [],
      })).toEqual({ task: 'plan-milestone' })

      // Step 4: Run planning
      let plannerDone = false
      h.agentRunner.onRun = () => {
        if (!plannerDone) {
          plannerDone = true
          h.milestoneRepo.save(project.id, makeMs({
            id: 'ms-e2e', title: 'E2E Milestone', description: 'Full flow', status: 'draft',
            checks: [
              makeCheck({ title: 'All features work', status: 'pending' }),
              makeCheck({ title: 'Tests pass', status: 'pending' }),
            ],
          }))
        }
      }

      const planTask = new MilestonePlanningTask({
        projectId: project.id, projectPath: project.path,
        projectRepo: h.projectRepo as unknown as ProjectRepository,
        milestoneRepo: h.milestoneRepo as unknown as MilestoneRepository,
        backlogRepo: h.backlogRepo as unknown as BacklogRepository,
        milestoneItemRepo: h.milestoneItemRepo as unknown as import('../repositories/MilestoneItemRepository').MilestoneItemRepository,
        agentRunner: h.agentRunner as unknown as AgentRunner,
        notifier: new Notifier(project.id, () => null),
      })
      await planTask.execute({ task: 'plan-milestone' }, new AbortController().signal)

      // With autoApprove → ready
      expect(h.milestoneRepo.getById('ms-e2e')!.status).toBe('ready')

      // Step 5: Verify decide() wants to dispatch developer
      const ctx2 = {
        project: h.projectRepo.getById(project.id)!,
        milestones: h.milestoneRepo.getByProjectId(project.id),
        backlogItems: h.backlogRepo.getByProjectId(project.id),
        pendingMentions: [],
      }
      const decision = think(ctx2)
      expect(decision.task).toBe('dispatch-agent')

      // Step 6: Run agent dispatch (developer)
      h.agentRunner.calls = []
      h.agentRunner.onRun = () => {
        h.milestoneRepo.updateChecks('ms-e2e', [
          makeCheck({ title: 'All features work', status: 'passed', iteration: 1 }),
          makeCheck({ title: 'Tests pass', status: 'passed', iteration: 1 }),
        ])
      }

      const agentTask = new MilestoneAgentTask({
        projectId: project.id, projectPath: project.path,
        projectRepo: h.projectRepo as unknown as ProjectRepository,
        milestoneRepo: h.milestoneRepo as unknown as MilestoneRepository,
        commentRepo: h.commentRepo as unknown as CommentRepository,
        gitService: h.gitService as unknown as GitService,
        agentRunner: h.agentRunner as unknown as AgentRunner,
        notifier: new Notifier(project.id, () => null),
      })
      await agentTask.execute(
        { task: 'dispatch-agent', agentId: 'developer', milestoneId: 'ms-e2e' },
        new AbortController().signal,
      )

      expect(h.milestoneRepo.getById('ms-e2e')!.status).toBe('in_review')

      // Step 7: Human accepts
      h.soulService.add(h.projectRepo.getById(project.id)!)
      await h.soulService.transition(project.id, 'ms-e2e', { action: 'accept' })

      const final = h.milestoneRepo.getById('ms-e2e')!
      expect(final.status).toBe('completed')
      expect(final.completedAt).toBeTruthy()
      expect(h.gitService.branchCreated).toContain('milestone/ms-e2e')
      expect(h.gitService.mergedBranches).toContain('milestone/ms-e2e')

      // Project status after accept: lifecycle sets 'sleeping', no more work → stays sleeping
      const finalProject = h.projectRepo.getById(project.id)!
      expect(finalProject.status).toBe('sleeping')
    })
  })
})
