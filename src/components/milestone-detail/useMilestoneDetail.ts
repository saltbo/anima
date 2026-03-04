import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLoaderData } from 'react-router-dom'
import { useProjects } from '@/store/projects'
import { nowISO } from '@/lib/time'
import type { ProjectIterationStatus } from '@/types/electron.d'
import type {
  Milestone, BacklogItem, Iteration,
  MilestoneComment, MilestoneGitInfo, MilestoneAction,
} from '@/types/index'
import type { MilestoneDetailLoaderData } from '@/types/router'

export function useMilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)
  const loaderData = useLoaderData() as MilestoneDetailLoaderData

  // ── Core state ──────────────────────────────────────────────────────────
  const [milestone, setMilestone] = useState<Milestone | null>(loaderData.milestone)
  const [backlogItems] = useState<BacklogItem[]>(loaderData.backlogItems)
  const [comments, setComments] = useState<MilestoneComment[]>(loaderData.comments)
  const [gitInfo, setGitInfo] = useState<MilestoneGitInfo | null>(null)
  const [markdownContent, setMarkdownContent] = useState(loaderData.markdown)
  const [savingMarkdown, setSavingMarkdown] = useState(false)

  // ── Dialog state ────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [requestChangesOpen, setRequestChangesOpen] = useState(false)
  const [requestChangesText, setRequestChangesText] = useState('')

  // ── Iteration state ────────────────────────────────────────────────────
  const [status, setStatus] = useState<ProjectIterationStatus>(() => ({
    projectId: id ?? '',
    status: project?.status ?? 'sleeping',
    currentIteration: project?.currentIteration ?? null,
    rateLimitResetAt: project?.rateLimitResetAt ?? null,
  }))
  const [activeAgent, setActiveAgent] = useState<'developer' | 'acceptor' | null>(null)
  const [iterations, setIterations] = useState<Iteration[]>(loaderData.milestone?.iterations ?? [])

  // ── Comment state ──────────────────────────────────────────────────────
  const [commentText, setCommentText] = useState('')

  // ── Load git info ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!project || !milestone) return
    if (milestone.status !== 'in-progress' && milestone.status !== 'awaiting_review') return
    window.electronAPI.getMilestoneGitStatus(project.id, milestone.id).then(setGitInfo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, milestone?.id, milestone?.status])

  // ── IPC listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    return window.electronAPI.onMilestoneReviewDone((milestoneId) => {
      if (milestoneId !== mid || !project) return
      window.electronAPI.getMilestones(project.id).then((milestones) => {
        const m = milestones.find((ms) => ms.id === mid) ?? null
        setMilestone(m)
        if (m) setIterations(m.iterations ?? [])
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, project?.id])

  useEffect(() => {
    if (!project) return
    setStatus((prev) => ({
      ...prev,
      status: project.status,
      currentIteration: project.currentIteration,
      rateLimitResetAt: project.rateLimitResetAt,
    }))
  }, [project])

  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.electronAPI.onProjectStatusChanged((s) => {
        if (s.projectId !== id) return
        setStatus(s)
      })
    )

    cleanups.push(
      window.electronAPI.onProjectAgentEvent((data) => {
        if (data.projectId !== id) return
        setActiveAgent(data.role)
      })
    )

    cleanups.push(
      window.electronAPI.onMilestoneUpdated((data) => {
        const d = data as { projectId: string; milestone: Milestone }
        if (d.milestone.id !== mid) return
        setMilestone(d.milestone)
        setIterations(d.milestone.iterations ?? [])
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [id, mid])

  // ── Actions ────────────────────────────────────────────────────────────
  const handleMarkReady = useCallback(async () => {
    if (!project || !milestone) return
    const action: MilestoneAction = 'approve'
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action })
    setMilestone({ ...milestone, status: 'ready' })
  }, [project, milestone])

  const handleSaveMarkdown = useCallback(async () => {
    if (!project || !milestone) return
    setSavingMarkdown(true)
    await window.electronAPI.writeMilestoneMarkdown(project.id, milestone.id, markdownContent)
    setSavingMarkdown(false)
  }, [project, milestone, markdownContent])

  const handleDelete = useCallback(async () => {
    if (!project || !milestone) return
    await window.electronAPI.deleteMilestone(project.id, milestone.id)
    navigate(`/projects/${id}/milestones`)
  }, [project, milestone, id, navigate])

  const handleCancel = useCallback(async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'cancel' })
    setMilestone({ ...milestone, status: 'cancelled' })
    setCancelOpen(false)
  }, [project, milestone])

  const handleReopen = useCallback(async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'reopen' })
    setMilestone({ ...milestone, status: 'draft' })
  }, [project, milestone])

  const handleAcceptMerge = useCallback(async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'accept' })
    setMilestone({ ...milestone, status: 'completed', completedAt: nowISO() })
  }, [project, milestone])

  const handleRollback = useCallback(async () => {
    if (!project || !milestone) return
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'rollback' })
    setMilestone({ ...milestone, status: 'ready', iterationCount: 0 })
    setRollbackOpen(false)
  }, [project, milestone])

  const handleRequestChanges = useCallback(async () => {
    if (!project || !milestone || !requestChangesText.trim()) return
    const commentId = crypto.randomUUID()
    await window.electronAPI.transitionMilestone(project.id, milestone.id, {
      action: 'request_changes',
      comment: { id: commentId, body: requestChangesText.trim() },
    })
    setComments((prev) => [...prev, {
      id: commentId,
      milestoneId: milestone.id,
      body: requestChangesText.trim(),
      author: 'human',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }])
    setMilestone({ ...milestone, status: 'ready' })
    setRequestChangesText('')
    setRequestChangesOpen(false)
  }, [project, milestone, requestChangesText])

  const handleAddComment = useCallback(async () => {
    if (!project || !milestone || !commentText.trim()) return
    const commentId = crypto.randomUUID()
    const newComment: MilestoneComment = {
      id: commentId,
      milestoneId: milestone.id,
      body: commentText.trim(),
      author: 'human',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }
    await window.electronAPI.addMilestoneComment(newComment)
    setComments((prev) => [...prev, newComment])
    setCommentText('')
  }, [project, milestone, commentText])

  const handleCloseWithComment = useCallback(async () => {
    if (!project || !milestone) return
    // Save comment first if there is one
    if (commentText.trim()) {
      const commentId = crypto.randomUUID()
      const newComment: MilestoneComment = {
        id: commentId,
        milestoneId: milestone.id,
        body: commentText.trim(),
        author: 'human',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      await window.electronAPI.addMilestoneComment(newComment)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    }
    // Then close the milestone
    await window.electronAPI.transitionMilestone(project.id, milestone.id, { action: 'close' })
    setMilestone({ ...milestone, status: 'cancelled' })
  }, [project, milestone, commentText])

  // ── Derived state ──────────────────────────────────────────────────────
  const currentIter = status.currentIteration
  const isCurrentMilestone = currentIter?.milestoneId === mid

  const completedTaskCount = milestone?.tasks.filter((t) => t.completed).length ?? 0
  const totalTaskCount = milestone?.tasks.length ?? 0
  const progressPct = totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0

  const passedACCount = milestone?.acceptanceCriteria.filter((ac) => ac.status === 'passed').length ?? 0
  const totalACCount = milestone?.acceptanceCriteria.length ?? 0

  return {
    // Identifiers
    id, mid, project,

    // Core data
    milestone, backlogItems, comments, gitInfo,
    markdownContent, setMarkdownContent, savingMarkdown,
    iterations, status, activeAgent,
    commentText, setCommentText,

    // Derived
    currentIter, isCurrentMilestone,
    completedTaskCount, totalTaskCount, progressPct,
    passedACCount, totalACCount,

    // Dialog state
    deleteOpen, setDeleteOpen,
    cancelOpen, setCancelOpen,
    rollbackOpen, setRollbackOpen,
    requestChangesOpen, setRequestChangesOpen,
    requestChangesText, setRequestChangesText,

    // Actions
    handleMarkReady, handleSaveMarkdown, handleDelete,
    handleCancel, handleReopen, handleAcceptMerge,
    handleRollback, handleRequestChanges, handleAddComment,
    handleCloseWithComment,
  }
}
