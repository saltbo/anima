/**
 * Frontend Hook Tests — useMilestoneDetail & useProjects
 *
 * Tests the core frontend business logic: optimistic updates, IPC listener
 * handling, derived state computation, and guard conditions.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type React from 'react'
import type { ReactNode } from 'react'
import type { Project, Milestone } from '@/types/index'
import type { ProjectIterationStatus, ProjectAgentEvent } from '@/types/electron.d'

// ═════════════════════════════════════════════════════════════════════════════
//  MOCK window.electronAPI
// ═════════════════════════════════════════════════════════════════════════════

type Listener<T> = (data: T) => void

interface MockElectronAPI {
  // Captured IPC listeners for triggering in tests
  _listeners: {
    projectsUpdated: Listener<Project[]>[]
    projectStatusChanged: Listener<ProjectIterationStatus>[]
    projectAgentEvent: Listener<ProjectAgentEvent>[]
    milestoneUpdated: Listener<{ projectId: string; milestone: Milestone }>[]
    milestoneReviewDone: Listener<string>[]
  }
  // The actual mock API
  [key: string]: unknown
}

function createMockElectronAPI(projects: Project[] = []): MockElectronAPI {
  const listeners: MockElectronAPI['_listeners'] = {
    projectsUpdated: [],
    projectStatusChanged: [],
    projectAgentEvent: [],
    milestoneUpdated: [],
    milestoneReviewDone: [],
  }

  return {
    _listeners: listeners,

    // Projects
    getProjects: vi.fn().mockResolvedValue(projects),
    addProject: vi.fn().mockResolvedValue(null),
    removeProject: vi.fn().mockResolvedValue(true),
    onProjectsUpdated: vi.fn((cb: Listener<Project[]>) => {
      listeners.projectsUpdated.push(cb)
      return () => { listeners.projectsUpdated = listeners.projectsUpdated.filter((l) => l !== cb) }
    }),

    // Navigation
    navigateTo: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(() => () => {}),
    onTriggerAddProject: vi.fn(() => () => {}),

    // Setup
    checkProjectSetup: vi.fn().mockResolvedValue({ hasSoul: false }),
    readSetupFiles: vi.fn().mockResolvedValue({ soul: null }),
    writeSetupFile: vi.fn().mockResolvedValue(undefined),
    startSetupAgent: vi.fn().mockResolvedValue(''),
    listSoulTemplates: vi.fn().mockResolvedValue([]),
    applySoulTemplate: vi.fn().mockResolvedValue(undefined),
    startSoulAgent: vi.fn().mockResolvedValue(''),

    // Agent
    readSessionEvents: vi.fn().mockResolvedValue([]),
    stopAgent: vi.fn().mockResolvedValue(undefined),
    watchSession: vi.fn().mockResolvedValue([]),
    unwatchSession: vi.fn().mockResolvedValue(undefined),
    onSessionEvent: vi.fn(() => () => {}),

    // Backlog
    getBacklogItems: vi.fn().mockResolvedValue([]),
    addBacklogItem: vi.fn().mockResolvedValue({ id: 'bl-new', title: '', type: 'idea', priority: 'medium', status: 'todo', createdAt: '' }),
    updateBacklogItem: vi.fn().mockResolvedValue(null),
    deleteBacklogItem: vi.fn().mockResolvedValue(undefined),

    // Milestones
    getMilestones: vi.fn().mockResolvedValue([]),
    saveMilestone: vi.fn().mockResolvedValue(undefined),
    deleteMilestone: vi.fn().mockResolvedValue(undefined),
    onMilestoneReviewDone: vi.fn((cb: Listener<string>) => {
      listeners.milestoneReviewDone.push(cb)
      return () => { listeners.milestoneReviewDone = listeners.milestoneReviewDone.filter((l) => l !== cb) }
    }),
    onMilestoneUpdated: vi.fn((cb: Listener<{ projectId: string; milestone: Milestone }>) => {
      listeners.milestoneUpdated.push(cb)
      return () => { listeners.milestoneUpdated = listeners.milestoneUpdated.filter((l) => l !== cb) }
    }),
    onMilestoneCompleted: vi.fn(() => () => {}),

    // Scheduler
    wakeProject: vi.fn().mockResolvedValue(undefined),
    updateWakeSchedule: vi.fn().mockResolvedValue(undefined),
    updateAutoMerge: vi.fn().mockResolvedValue(undefined),
    updateAutoApprove: vi.fn().mockResolvedValue(undefined),
    transitionMilestone: vi.fn().mockResolvedValue(undefined),
    getMilestoneGitStatus: vi.fn().mockResolvedValue(null),
    getMilestoneComments: vi.fn().mockResolvedValue([]),
    addMilestoneComment: vi.fn().mockResolvedValue(undefined),
    onMilestoneAwaitingReview: vi.fn(() => () => {}),
    onProjectStatusChanged: vi.fn((cb: Listener<ProjectIterationStatus>) => {
      listeners.projectStatusChanged.push(cb)
      return () => { listeners.projectStatusChanged = listeners.projectStatusChanged.filter((l) => l !== cb) }
    }),
    onProjectAgentEvent: vi.fn((cb: Listener<ProjectAgentEvent>) => {
      listeners.projectAgentEvent.push(cb)
      return () => { listeners.projectAgentEvent = listeners.projectAgentEvent.filter((l) => l !== cb) }
    }),
    onIterationPaused: vi.fn(() => () => {}),
    onRateLimited: vi.fn(() => () => {}),

    // Actions
    getActionsByMilestone: vi.fn().mockResolvedValue([]),
    getRecentActions: vi.fn().mockResolvedValue([]),
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  FIXTURES
// ═════════════════════════════════════════════════════════════════════════════

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    path: '/tmp/project',
    name: 'Test',
    addedAt: '2026-03-01T12:00:00.000Z',
    status: 'idle',
    currentIteration: null,
    nextWakeTime: null,
    wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] },
    autoMerge: false,
    autoApprove: false,
    totalTokens: 0,
    totalCost: 0,
    rateLimitResetAt: null,
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms-1',
    title: 'Test Milestone',
    description: 'Test description',
    status: 'in_review',
    checks: [
      { id: 'chk-1', milestoneId: 'ms-1', itemId: 'item-1', title: 'Feature A works', status: 'passed', iteration: 1, createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-01T12:00:00Z' },
      { id: 'chk-2', milestoneId: 'ms-1', itemId: 'item-1', title: 'Feature B works', status: 'pending', iteration: 1, createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-01T12:00:00Z' },
    ],
    items: [
      { id: 'item-1', type: 'feature', title: 'Add login', priority: 'high', status: 'done', createdAt: '2026-03-01T12:00:00Z' },
      { id: 'item-2', type: 'feature', title: 'Add signup', priority: 'medium', status: 'in_progress', createdAt: '2026-03-01T12:00:00Z' },
      { id: 'item-3', type: 'feature', title: 'Add logout', priority: 'low', status: 'done', createdAt: '2026-03-01T12:00:00Z' },
    ],
    createdAt: '2026-03-01T12:00:00.000Z',
    iterationCount: 1,
    iterations: [
      { milestoneId: 'ms-1', round: 1, outcome: 'passed', startedAt: '2026-03-01T12:00:00Z', completedAt: '2026-03-01T12:10:00Z', totalTokens: 500, totalCost: 0.05, sessions: [] },
    ],
    totalTokens: 500,
    totalCost: 0.05,
    baseCommit: 'abc123',
    assignees: [],
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  useProjects TESTS
// ═════════════════════════════════════════════════════════════════════════════

// We import lazily so window.electronAPI is already set up
async function importUseProjects() {
  // Clear module cache to get fresh import with mocked window.electronAPI
  const mod = await import('@/store/projects')
  return mod
}

describe('useProjects', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    mockAPI = createMockElectronAPI([makeProject()])
    window.electronAPI = mockAPI as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads projects on mount', async () => {
    const { ProjectsProvider, useProjects } = await importUseProjects()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectsProvider>{children}</ProjectsProvider>
    )

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1)
    })
    expect(result.current.projects[0].id).toBe('proj-1')
    expect(mockAPI.getProjects).toHaveBeenCalledOnce()
  })

  it('updates projects when IPC broadcasts', async () => {
    const { ProjectsProvider, useProjects } = await importUseProjects()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectsProvider>{children}</ProjectsProvider>
    )

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1)
    })

    // Simulate IPC: projects updated with a new project added
    const updated = [makeProject(), makeProject({ id: 'proj-2', name: 'Second' })]
    act(() => {
      mockAPI._listeners.projectsUpdated.forEach((cb) => cb(updated))
    })

    expect(result.current.projects).toHaveLength(2)
    expect(result.current.projects[1].id).toBe('proj-2')
  })

  it('updates project status from IPC statusChanged', async () => {
    const { ProjectsProvider, useProjects } = await importUseProjects()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectsProvider>{children}</ProjectsProvider>
    )

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1)
    })

    // Simulate IPC: project status changed to busy
    act(() => {
      mockAPI._listeners.projectStatusChanged.forEach((cb) => cb({
        projectId: 'proj-1',
        status: 'busy',
        currentIteration: { milestoneId: 'ms-1', round: 1 },
        rateLimitResetAt: null,
      }))
    })

    expect(result.current.projects[0].status).toBe('busy')
    expect(result.current.projects[0].currentIteration?.milestoneId).toBe('ms-1')
  })

  it('clears selectedProjectId on remove', async () => {
    const { ProjectsProvider, useProjects } = await importUseProjects()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectsProvider>{children}</ProjectsProvider>
    )

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1)
    })

    // Select the project
    act(() => {
      result.current.setSelectedProjectId('proj-1')
    })
    expect(result.current.selectedProjectId).toBe('proj-1')
    expect(result.current.selectedProject?.id).toBe('proj-1')

    // Remove it
    await act(async () => {
      await result.current.removeProject('proj-1')
    })

    expect(result.current.selectedProjectId).toBeNull()
    expect(mockAPI.removeProject).toHaveBeenCalledWith('proj-1')
  })

  it('ignores status updates for other projects', async () => {
    const { ProjectsProvider, useProjects } = await importUseProjects()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectsProvider>{children}</ProjectsProvider>
    )

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1)
    })

    // Status update for a different project
    act(() => {
      mockAPI._listeners.projectStatusChanged.forEach((cb) => cb({
        projectId: 'proj-999',
        status: 'busy',
        currentIteration: null,
        rateLimitResetAt: null,
      }))
    })

    // Our project should be unchanged
    expect(result.current.projects[0].status).toBe('idle')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
//  useMilestoneDetail TESTS
// ═════════════════════════════════════════════════════════════════════════════

// Mock react-router-dom hooks used by useMilestoneDetail
const mockNavigate = vi.fn()
let mockLoaderData: unknown = {}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLoaderData: () => mockLoaderData,
  }
})

async function importUseMilestoneDetail() {
  const mod = await import('@/components/milestone-detail/useMilestoneDetail')
  return mod.useMilestoneDetail
}

async function importProjectsProvider() {
  const mod = await import('@/store/projects')
  return mod.ProjectsProvider
}

describe('useMilestoneDetail', () => {
  let mockAPI: MockElectronAPI
  let Provider: React.ComponentType<{ children: ReactNode }>
  const project = makeProject()
  const milestone = makeMilestone()

  // Wrapper: provides router context with params id=proj-1, mid=ms-1
  // and ProjectsProvider with the test project
  function createWrapper() {
    return ({ children }: { children: ReactNode }) => (
      <Provider>
        <MemoryRouter initialEntries={['/projects/proj-1/milestones/ms-1']}>
          <Routes>
            <Route path="/projects/:id/milestones/:mid" element={children} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
  }

  beforeEach(async () => {
    mockAPI = createMockElectronAPI([project])
    window.electronAPI = mockAPI as unknown as typeof window.electronAPI

    Provider = await importProjectsProvider()

    mockLoaderData = {
      meta: { title: milestone.title },
      milestone,
      backlogItems: [],
      comments: [],
      actions: [],
    }
    mockNavigate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Derived state computation ─────────────────────────────────────────

  describe('derived state', () => {
    it('computes task progress correctly', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // milestone has 3 tasks, 2 completed
      expect(result.current.completedTaskCount).toBe(2)
      expect(result.current.totalTaskCount).toBe(3)
      expect(result.current.progressPct).toBe(67) // Math.round(2/3 * 100)
    })

    it('computes AC progress correctly', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // milestone has 2 AC, 1 passed
      expect(result.current.passedACCount).toBe(1)
      expect(result.current.totalACCount).toBe(2)
    })

    it('returns 0% progress when no items', async () => {
      mockLoaderData = {
        meta: { title: 'Empty' },
        milestone: makeMilestone({ items: [], checks: [] }),
        backlogItems: [],
        comments: [],
        actions: [],
      }

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      expect(result.current.progressPct).toBe(0)
      expect(result.current.passedACCount).toBe(0)
    })

    it('detects current milestone from iteration status', async () => {
      // Set up project with currentIteration pointing to our milestone
      const busyProject = makeProject({
        status: 'busy',
        currentIteration: { milestoneId: 'ms-1', round: 1 },
      })
      mockAPI = createMockElectronAPI([busyProject])
      window.electronAPI = mockAPI as unknown as typeof window.electronAPI

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isCurrentMilestone).toBe(true)
      })
    })
  })

  // ── Actions / optimistic updates ──────────────────────────────────────

  describe('actions', () => {
    it('handleMarkReady calls transitionMilestone and updates status optimistically', async () => {
      mockLoaderData = {
        meta: { title: 'Test' },
        milestone: makeMilestone({ status: 'planned' }),
        backlogItems: [],
        comments: [],
        actions: [],
      }

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      await act(async () => {
        await result.current.handleMarkReady()
      })

      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'approve' })
      expect(result.current.milestone!.status).toBe('ready')
    })

    it('handleAcceptMerge sets status to completed with timestamp', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      await act(async () => {
        await result.current.handleAcceptMerge()
      })

      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'accept' })
      expect(result.current.milestone!.status).toBe('completed')
      expect(result.current.milestone!.completedAt).toBeTruthy()
    })

    it('handleCancel sets status to cancelled and closes dialog', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // Open dialog first
      act(() => { result.current.setCancelOpen(true) })
      expect(result.current.cancelOpen).toBe(true)

      await act(async () => {
        await result.current.handleCancel()
      })

      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'cancel' })
      expect(result.current.milestone!.status).toBe('cancelled')
      expect(result.current.cancelOpen).toBe(false)
    })

    it('handleReopen sets status to draft', async () => {
      mockLoaderData = {
        meta: { title: 'Test' },
        milestone: makeMilestone({ status: 'cancelled' }),
        backlogItems: [],
        comments: [],
        actions: [],
      }

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      await act(async () => {
        await result.current.handleReopen()
      })

      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'reopen' })
      expect(result.current.milestone!.status).toBe('draft')
    })

    it('handleRollback resets status and iteration count', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      act(() => { result.current.setRollbackOpen(true) })

      await act(async () => {
        await result.current.handleRollback()
      })

      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'rollback' })
      expect(result.current.milestone!.status).toBe('ready')
      expect(result.current.milestone!.iterationCount).toBe(0)
      expect(result.current.rollbackOpen).toBe(false)
    })

    it('handleDelete calls API and navigates to milestones list', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      await act(async () => {
        await result.current.handleDelete()
      })

      expect(mockAPI.deleteMilestone).toHaveBeenCalledWith('proj-1', 'ms-1')
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1/milestones')
    })

    it('handleRequestChanges adds comment, sets ready, clears input, closes dialog', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // Set up dialog and text
      act(() => {
        result.current.setRequestChangesOpen(true)
        result.current.setRequestChangesText('Fix the login page')
      })

      await act(async () => {
        await result.current.handleRequestChanges()
      })

      // Should call API with request_changes + comment
      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', {
        action: 'request_changes',
        comment: expect.objectContaining({ body: 'Fix the login page' }),
      })
      // Optimistic: status → ready
      expect(result.current.milestone!.status).toBe('ready')
      // Comment added locally
      expect(result.current.comments).toHaveLength(1)
      expect(result.current.comments[0].body).toBe('Fix the login page')
      expect(result.current.comments[0].author).toBe('human')
      // Input cleared, dialog closed
      expect(result.current.requestChangesText).toBe('')
      expect(result.current.requestChangesOpen).toBe(false)
    })

    it('handleRequestChanges does nothing with empty text', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // Text is empty (default)
      await act(async () => {
        await result.current.handleRequestChanges()
      })

      expect(mockAPI.transitionMilestone).not.toHaveBeenCalled()
      expect(result.current.milestone!.status).toBe('in_review')
    })

    it('handleAddComment adds comment and clears input', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      act(() => { result.current.setCommentText('Looks good!') })

      await act(async () => {
        await result.current.handleAddComment()
      })

      expect(mockAPI.addMilestoneComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Looks good!', author: 'human', milestoneId: 'ms-1' }),
      )
      expect(result.current.comments).toHaveLength(1)
      expect(result.current.commentText).toBe('')
    })

    it('handleAddComment does nothing with empty text', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      await act(async () => {
        await result.current.handleAddComment()
      })

      expect(mockAPI.addMilestoneComment).not.toHaveBeenCalled()
    })

    it('handleCloseWithComment saves comment then closes milestone', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      act(() => { result.current.setCommentText('Closing because duplicate') })

      await act(async () => {
        await result.current.handleCloseWithComment()
      })

      // Comment saved first
      expect(mockAPI.addMilestoneComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Closing because duplicate' }),
      )
      // Then transition to close
      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'close' })
      expect(result.current.milestone!.status).toBe('closed')
      expect(result.current.comments).toHaveLength(1)
    })

    it('handleCloseWithComment works without comment text', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // No comment text
      await act(async () => {
        await result.current.handleCloseWithComment()
      })

      expect(mockAPI.addMilestoneComment).not.toHaveBeenCalled()
      expect(mockAPI.transitionMilestone).toHaveBeenCalledWith('proj-1', 'ms-1', { action: 'close' })
      expect(result.current.milestone!.status).toBe('closed')
    })
  })

  // ── IPC listeners ─────────────────────────────────────────────────────

  describe('IPC listeners', () => {
    it('onMilestoneUpdated refreshes milestone and iterations', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // Simulate IPC: milestone updated with new status
      const updatedMs = makeMilestone({
        status: 'completed',
        iterations: [
          { milestoneId: 'ms-1', round: 1, outcome: 'passed' },
          { milestoneId: 'ms-1', round: 2, outcome: 'passed' },
        ],
      })

      act(() => {
        mockAPI._listeners.milestoneUpdated.forEach((cb) =>
          cb({ projectId: 'proj-1', milestone: updatedMs }),
        )
      })

      expect(result.current.milestone!.status).toBe('completed')
      expect(result.current.iterations).toHaveLength(2)
    })

    it('onMilestoneUpdated ignores updates for other milestones', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      // Update for a different milestone
      act(() => {
        mockAPI._listeners.milestoneUpdated.forEach((cb) =>
          cb({ projectId: 'proj-1', milestone: makeMilestone({ id: 'ms-other', status: 'completed' }) }),
        )
      })

      // Our milestone unchanged
      expect(result.current.milestone!.status).toBe('in_review')
    })

    it('onProjectAgentEvent sets activeAgent', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      expect(result.current.activeAgent).toBeNull()

      act(() => {
        mockAPI._listeners.projectAgentEvent.forEach((cb) =>
          cb({ projectId: 'proj-1', role: 'developer', sessionId: 'sess-1' }),
        )
      })

      expect(result.current.activeAgent).toBe('developer')

      act(() => {
        mockAPI._listeners.projectAgentEvent.forEach((cb) =>
          cb({ projectId: 'proj-1', role: 'reviewer', sessionId: 'sess-2' }),
        )
      })

      expect(result.current.activeAgent).toBe('reviewer')
    })

    it('onProjectAgentEvent ignores events for other projects', async () => {
      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      act(() => {
        mockAPI._listeners.projectAgentEvent.forEach((cb) =>
          cb({ projectId: 'proj-999', role: 'developer', sessionId: 'sess-1' }),
        )
      })

      expect(result.current.activeAgent).toBeNull()
    })
  })

  // ── Git info loading ──────────────────────────────────────────────────

  describe('git info', () => {
    it('loads git info for in_progress milestone', async () => {
      const gitInfo = { branch: 'milestone/ms-1', commitCount: 3, diffStats: { filesChanged: 5, insertions: 100, deletions: 20 } }
      ;(mockAPI.getMilestoneGitStatus as ReturnType<typeof vi.fn>).mockResolvedValue(gitInfo)

      mockLoaderData = {
        meta: { title: 'Test' },
        milestone: makeMilestone({ status: 'in_progress' }),
        backlogItems: [],
        comments: [],
        actions: [],
      }

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.gitInfo).not.toBeNull()
      })

      expect(result.current.gitInfo!.commitCount).toBe(3)
      expect(mockAPI.getMilestoneGitStatus).toHaveBeenCalledWith('proj-1', 'ms-1')
    })

    it('does not load git info for draft milestone', async () => {
      mockLoaderData = {
        meta: { title: 'Test' },
        milestone: makeMilestone({ status: 'draft' }),
        backlogItems: [],
        comments: [],
        actions: [],
      }

      const useMilestoneDetail = await importUseMilestoneDetail()
      const { result } = renderHook(() => useMilestoneDetail(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.milestone).not.toBeNull()
        expect(result.current.project).toBeDefined()
      })

      expect(mockAPI.getMilestoneGitStatus).not.toHaveBeenCalled()
      expect(result.current.gitInfo).toBeNull()
    })
  })
})
