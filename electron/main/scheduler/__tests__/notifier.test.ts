/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Notifier } from '../notifier'
import type { Project } from '../../../../src/types/index'

function createMockWindow() {
  const send = vi.fn()
  return {
    send,
    isDestroyed: vi.fn(() => false),
    webContents: { send },
  }
}

const DEFAULT_PROJECT: Project = {
  id: 'proj-1',
  path: '/test/project',
  name: 'test',
  addedAt: '2026-01-01',
  status: 'sleeping',
  currentIteration: null,
  nextWakeTime: null,
  wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
  totalTokens: 0,
  totalCost: 0,
  rateLimitResetAt: null,
}

describe('Notifier', () => {
  let mockWindow: ReturnType<typeof createMockWindow>
  let notifier: Notifier

  beforeEach(() => {
    mockWindow = createMockWindow()
    notifier = new Notifier('proj-1', () => mockWindow as any)
  })

  describe('broadcastStatus', () => {
    it('sends project:statusChanged with correct payload', () => {
      const project: Project = {
        ...DEFAULT_PROJECT,
        status: 'awake',
        currentIteration: { milestoneId: 'm-1', round: 2 },
      }

      notifier.broadcastStatus(project)

      expect(mockWindow.send).toHaveBeenCalledWith('project:statusChanged', {
        projectId: 'proj-1',
        status: 'awake',
        currentIteration: { milestoneId: 'm-1', round: 2 },
        rateLimitResetAt: null,
      })
    })
  })

  describe('broadcastAgentEvent', () => {
    it('sends project:agentEvent with role and agentKey', () => {
      notifier.broadcastAgentEvent('developer', 'm1-dev-1')

      expect(mockWindow.send).toHaveBeenCalledWith('project:agentEvent', {
        projectId: 'proj-1',
        role: 'developer',
        agentKey: 'm1-dev-1',
      })
    })
  })

  describe('broadcastMilestoneUpdate', () => {
    it('sends milestones:updated with milestone data', () => {
      const milestone = {
        id: 'm-1',
        title: 'Test',
        description: '',
        status: 'in-progress' as const,
        acceptanceCriteria: [],
        tasks: [],
        inboxItemIds: [],
        createdAt: '2026-01-01',
        iterationCount: 0,
        iterations: [],
      }

      notifier.broadcastMilestoneUpdate(milestone)

      expect(mockWindow.send).toHaveBeenCalledWith('milestones:updated', {
        projectId: 'proj-1',
        milestone,
      })
    })
  })

  describe('notifyIterationPaused', () => {
    it('sends project:iterationPaused', () => {
      notifier.notifyIterationPaused('m-1', 'max_iterations')

      expect(mockWindow.send).toHaveBeenCalledWith('project:iterationPaused', {
        projectId: 'proj-1',
        milestoneId: 'm-1',
        reason: 'max_iterations',
      })
    })
  })

  describe('notifyRateLimited', () => {
    it('sends agent:rateLimited', () => {
      notifier.notifyRateLimited('2026-03-01T15:00:00Z')

      expect(mockWindow.send).toHaveBeenCalledWith('agent:rateLimited', {
        projectId: 'proj-1',
        resetAt: '2026-03-01T15:00:00Z',
      })
    })
  })

  describe('notifyMilestoneCompleted', () => {
    it('sends milestones:completed', () => {
      notifier.notifyMilestoneCompleted('m-1')

      expect(mockWindow.send).toHaveBeenCalledWith('milestones:completed', {
        projectId: 'proj-1',
        milestoneId: 'm-1',
      })
    })
  })

  describe('when window is null', () => {
    it('does not throw', () => {
      const notifierNoWin = new Notifier('proj-1', () => null)
      expect(() => notifierNoWin.broadcastStatus(DEFAULT_PROJECT)).not.toThrow()
    })
  })

  describe('when window is destroyed', () => {
    it('does not send', () => {
      mockWindow.isDestroyed.mockReturnValue(true)
      notifier.broadcastStatus(DEFAULT_PROJECT)

      expect(mockWindow.send).not.toHaveBeenCalled()
    })
  })
})
