import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { ProjectService } from '../services/ProjectService'
import type { BacklogService } from '../services/BacklogService'
import type { MilestoneService } from '../services/MilestoneService'
import type { SoulService } from '../services/SoulService'
import type { SetupService } from '../services/SetupService'
import type { MilestoneRepository } from '../repositories/MilestoneRepository'
import type { CommentRepository } from '../repositories/CommentRepository'
import type { CheckRepository } from '../repositories/CheckRepository'
import type { ActionRepository } from '../repositories/ActionRepository'
import type { Project, Milestone, TransitionPayload, BacklogItem, BacklogItemPriority } from '../../../src/types/index'
import type { McpServerEntry } from '../mcp/mcpConfig'
import type { SetupType } from '../services/SetupService'
import type { CreateMilestoneInput } from '../services/MilestoneService'
import {
  getUserMcpServers,
  addUserMcpServer,
  updateUserMcpServer,
  removeUserMcpServer,
} from '../mcp/mcpConfig'
import { getAllAgents } from '../agents/registry'
import { findSessionFile, readEventsFromFile } from '../agents/claude-code/parser'
import type { SessionWatcher } from '../agents/SessionWatcher'
import { updateTray } from '../app/tray'

// ── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiHandler = (...args: any[]) => unknown

export interface ServiceContext {
  projectService: ProjectService
  backlogService: BacklogService
  milestoneService: MilestoneService
  milestoneRepo: MilestoneRepository
  soulService: SoulService
  setupService: SetupService
  commentRepo: CommentRepository
  checkRepo: CheckRepository
  actionRepo: ActionRepository
  sessionWatcher: SessionWatcher
}

// ── Route Map ────────────────────────────────────────────────────────────────

export function createRoutes(
  ctx: ServiceContext,
  getWindow: () => BrowserWindow | null
): Record<string, ApiHandler> {
  const { projectService, backlogService, milestoneService, milestoneRepo, soulService, setupService, commentRepo, checkRepo, actionRepo, sessionWatcher } = ctx

  return {
    // ── Projects ──────────────────────────────────────────────────────────
    'projects:list': () => projectService.list(),

    'projects:add': async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Directory',
        buttonLabel: 'Add Project',
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const project = projectService.add(result.filePaths[0])
      soulService.add(project)
      getWindow()?.webContents.send('projects:changed', projectService.list())
      updateTray(projectService, getWindow)
      return project
    },

    'projects:remove': (id: string) => {
      soulService.remove(id)
      projectService.remove(id)
      getWindow()?.webContents.send('projects:changed', projectService.list())
      updateTray(projectService, getWindow)
      return true
    },

    // ── Window ────────────────────────────────────────────────────────────
    'window:navigate': (path: string) => {
      const win = getWindow()
      if (win) {
        win.show()
        win.focus()
        win.webContents.send('window:navigate', path)
      }
    },

    // ── Setup ─────────────────────────────────────────────────────────────
    'setup:check': (projectPath: string) => setupService.checkProjectSetup(projectPath),
    'setup:readFiles': (projectPath: string) => setupService.readSetupFiles(projectPath),
    'setup:writeFile': (projectPath: string, type: 'soul', content: string) =>
      setupService.writeSetupFile(projectPath, type, content),
    'setup:startAgent': (id: string, projectPath: string, type: SetupType, userContext?: string) =>
      setupService.startSetupSession(id, projectPath, type, userContext),
    'setup:listTemplates': () => setupService.listSoulTemplates(),
    'setup:applyTemplate': (projectPath: string, templateId: string) =>
      setupService.applySoulTemplate(projectPath, templateId),
    'setup:startSoulAgent': (id: string, projectPath: string, templateId: string) =>
      setupService.startSoulSession(id, projectPath, templateId),

    // ── Agent ─────────────────────────────────────────────────────────────
    'agent:readSessionEvents': (sessionId: string) => {
      const filePath = findSessionFile(sessionId)
      if (!filePath) return []
      return readEventsFromFile(filePath, 0).events
    },
    'agent:stop': () => {
      // With stateless resume model, there's no long-running process to stop.
    },

    // ── Session watching (fs.watch → IPC push) ──────────────────────────
    'session:watch': (sessionId: string) => sessionWatcher.watch(sessionId),
    'session:unwatch': (sessionId: string) => sessionWatcher.unwatch(sessionId),

    // ── Backlog ───────────────────────────────────────────────────────────
    'backlog:list': (projectId: string) => backlogService.getItems(projectId),
    'backlog:add': (projectId: string, item: Omit<BacklogItem, 'id' | 'createdAt' | 'status'> & { priority: BacklogItemPriority }) =>
      backlogService.addItem(projectId, item),
    'backlog:update': (_projectId: string, id: string, patch: Partial<BacklogItem>) =>
      backlogService.updateItem(id, patch),
    'backlog:delete': (_projectId: string, id: string) => backlogService.deleteItem(id),

    // ── Milestones ────────────────────────────────────────────────────────
    'milestones:list': (projectId: string) => milestoneService.getMilestones(projectId),
    'milestones:getById': (id: string) => milestoneRepo.getById(id),
    'milestones:create': (projectId: string, input: CreateMilestoneInput) =>
      milestoneService.createMilestone(projectId, input),
    'milestones:save': (projectId: string, milestone: Milestone) =>
      milestoneService.saveMilestone(projectId, milestone),
    'milestones:delete': (projectId: string, id: string) =>
      milestoneService.deleteMilestone(projectId, id),
    'milestones:transition': async (projectId: string, milestoneId: string, payload: TransitionPayload) =>
      milestoneService.transition(projectId, milestoneId, payload),
    'milestones:assignAgent': (milestoneId: string, agentId: string) =>
      milestoneService.assignAgent(milestoneId, agentId),

    // ── Milestone comments ────────────────────────────────────────────────
    'milestones:listComments': (milestoneId: string) => commentRepo.getByMilestoneId(milestoneId),
    'milestones:addComment': (comment: { id: string; milestoneId: string; body: string; author: string; createdAt: string; updatedAt: string }) => {
      commentRepo.add(comment)
      const projectId = milestoneRepo.getProjectIdForMilestone(comment.milestoneId)
      if (projectId) soulService.wake(projectId)
    },

    // ── Checks ────────────────────────────────────────────────────────────
    'checks:list': (milestoneId: string) => checkRepo.getByMilestoneId(milestoneId),
    'checks:add': (checks: Array<Omit<import('../../../src/types/index').MilestoneCheck, 'id' | 'createdAt' | 'updatedAt'>>) =>
      checkRepo.bulkAdd(checks),
    'checks:update': (checkId: string, patch: Partial<Pick<import('../../../src/types/index').MilestoneCheck, 'status' | 'title' | 'description' | 'iteration'>>) =>
      checkRepo.update(checkId, patch),

    // ── Actions ────────────────────────────────────────────────────────────
    'actions:listByMilestone': (milestoneId: string) => actionRepo.getByMilestoneId(milestoneId),
    'actions:listByProject': (projectId: string, limit: number) => actionRepo.getByProjectId(projectId, limit ?? 20),
    'actions:listRecent': (limit: number) => actionRepo.getRecent(limit ?? 50),

    // ── Scheduler / Project ───────────────────────────────────────────────
    'project:wake': (projectId: string) => soulService.wake(projectId),
    'project:sleep': (projectId: string) => soulService.sleep(projectId),
    'project:updateSettings': (projectId: string, settings: Partial<Pick<Project, 'wakeSchedule' | 'autoMerge' | 'autoApprove'>>) => {
      if (settings.wakeSchedule !== undefined) {
        soulService.updateSchedule(projectId, settings.wakeSchedule)
      } else {
        projectService.patch(projectId, settings)
      }
      getWindow()?.webContents.send('projects:changed', projectService.list())
    },

    'milestone:gitStatus': async (projectId: string, milestoneId: string) =>
      soulService.getMilestoneGitStatus(projectId, milestoneId),

    // ── Agents ──────────────────────────────────────────────────────────
    'agents:list': () => getAllAgents().map(({ id, name, description }) => ({ id, name, description })),

    // ── MCP Servers ───────────────────────────────────────────────────────
    'mcp:list': () => getUserMcpServers(),
    'mcp:add': (name: string, entry: McpServerEntry) => addUserMcpServer(name, entry),
    'mcp:update': (name: string, entry: McpServerEntry) => updateUserMcpServer(name, entry),
    'mcp:remove': (name: string) => removeUserMcpServer(name),
  }
}
