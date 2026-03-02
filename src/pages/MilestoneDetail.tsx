import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, CheckCircle2, Circle, XCircle, ArrowRight, Loader2, Save, Activity, Ban, Pencil } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/store/theme'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { milestoneStatusLabel, milestoneStatusBadgeClass, milestoneStatusDotClass } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import type { Milestone, InboxItem } from '@/types/index'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

const TYPE_STYLES: Record<string, string> = {
  idea: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  bug: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
  feature: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20',
}

export function MilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [markdownContent, setMarkdownContent] = useState('')
  const [savingMarkdown, setSavingMarkdown] = useState(false)

  useEffect(() => {
    if (!project) return
    Promise.all([
      window.electronAPI.getMilestones(project.path),
      window.electronAPI.getInboxItems(project.path),
      window.electronAPI.readMilestoneMarkdown(project.path, mid!),
    ]).then(([milestones, items, md]) => {
      const m = milestones.find((ms) => ms.id === mid) ?? null
      setMilestone(m)
      setMarkdownContent(md ?? '')
      setInboxItems(items)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, mid])

  useEffect(() => {
    return window.electronAPI.onMilestoneReviewDone((milestoneId) => {
      if (milestoneId !== mid || !project) return
      window.electronAPI.getMilestones(project.path).then((milestones) => {
        setMilestone(milestones.find((ms) => ms.id === mid) ?? null)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, project?.id])

  const handleMarkReady = async () => {
    if (!project || !milestone) return
    const updated: Milestone = { ...milestone, status: 'ready' }
    await window.electronAPI.saveMilestone(project.path, updated)
    setMilestone(updated)
  }

  const handleMarkCompleted = async () => {
    if (!project || !milestone) return
    const updated: Milestone = { ...milestone, status: 'completed', completedAt: new Date().toISOString() }
    await window.electronAPI.saveMilestone(project.path, updated)
    setMilestone(updated)
  }

  const handleSaveMarkdown = async () => {
    if (!project || !milestone) return
    setSavingMarkdown(true)
    await window.electronAPI.writeMilestoneMarkdown(project.path, milestone.id, markdownContent)
    setSavingMarkdown(false)
  }

  const handleDelete = async () => {
    if (!project || !milestone) return
    await window.electronAPI.deleteMilestone(project.path, milestone.id)
    navigate(`/projects/${id}/milestones`)
  }

  const handleCancel = async () => {
    if (!project || !milestone) return
    await window.electronAPI.cancelMilestone(project.id, project.path, milestone.id)
    setMilestone({ ...milestone, status: 'cancelled' })
    setCancelOpen(false)
  }

  const handleEditCancelled = async () => {
    if (!project || !milestone) return
    const updated: Milestone = { ...milestone, status: 'draft' }
    await window.electronAPI.saveMilestone(project.path, updated)
    setMilestone(updated)
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 py-4 border-b border-border space-y-2 shrink-0">
          <div className="h-4 rounded-md bg-muted animate-pulse w-2/5" />
          <div className="h-3 rounded-md bg-muted animate-pulse w-3/5" />
        </div>
        <div className="flex-1 flex">
          <div className="flex-1 border-r border-border p-5 space-y-3">
            {[100, 85, 90, 70].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="w-72 p-4 space-y-3">
            {[60, 80, 50].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!milestone) {
    return <div className="p-6 text-sm text-muted-foreground">Milestone not found.</div>
  }

  const completedCount = milestone.tasks.filter((t) => t.completed).length
  const totalTasks = milestone.tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0
  const allDone = completedCount === totalTasks && totalTasks > 0
  const sortedTasks = [...milestone.tasks].sort((a, b) => {
    if (a.completed === b.completed) return a.order - b.order
    return a.completed ? 1 : -1
  })
  const isDraft = milestone.status === 'draft'
  const isReviewing = milestone.status === 'reviewing'
  const isReviewed = milestone.status === 'reviewed'
  const isInProgress = milestone.status === 'in-progress'
  const isReady = milestone.status === 'ready'
  const isCancelled = milestone.status === 'cancelled'

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header strip ──────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-border shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${milestoneStatusBadgeClass(milestone.status)}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${milestoneStatusDotClass(milestone.status)} ${isReviewing ? 'animate-pulse' : ''}`} />
              {milestoneStatusLabel(milestone.status)}
            </span>
            <span className="text-xs text-muted-foreground">Created {timeAgo(milestone.createdAt)}</span>
          </div>
          <h2 className="text-sm font-semibold text-foreground leading-snug">{milestone.title}</h2>
          {milestone.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{milestone.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {isInProgress && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={() => navigate(`/projects/${id}/milestones/${mid}/monitor`)}>
              <Activity size={12} />
              Monitor
            </Button>
          )}
          {isDraft && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={handleSaveMarkdown} disabled={savingMarkdown}>
              {savingMarkdown ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </Button>
          )}
          {isDraft && (
            <Button size="sm" className="h-7 text-xs gap-1 cursor-pointer" onClick={handleMarkReady}>
              Mark as Ready <ArrowRight size={12} />
            </Button>
          )}
          {isReviewed && milestone.review && (
            <Button size="sm" className="h-7 text-xs gap-1 cursor-pointer" onClick={handleMarkReady}>
              Approve <ArrowRight size={12} />
            </Button>
          )}
          {allDone && milestone.status !== 'completed' && (
            <Button size="sm" className="h-7 text-xs gap-1 cursor-pointer" onClick={handleMarkCompleted}>
              Mark Completed <ArrowRight size={12} />
            </Button>
          )}
          {(isReady || isInProgress) && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setCancelOpen(true)}>
              <Ban size={12} />
              Cancel
            </Button>
          )}
          {isCancelled && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 cursor-pointer" onClick={handleEditCancelled}>
              <Pencil size={12} />
              Edit
            </Button>
          )}
          {milestone.status !== 'completed' && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors duration-150 cursor-pointer px-1.5"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Reviewing banner ──────────────────────────────────── */}
      {isReviewing && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-yellow-500/20 bg-yellow-500/5 shrink-0">
          <Loader2 size={13} className="text-yellow-500 animate-spin shrink-0" />
          <span className="text-xs text-yellow-700 dark:text-yellow-400">AI review in progress…</span>
        </div>
      )}

      {/* ── Two-column body ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Markdown content */}
        <div className="flex-1 overflow-hidden flex flex-col border-r border-border" data-color-mode={resolvedTheme}>
          {isDraft ? (
            <MDEditor
              value={markdownContent}
              onChange={(v) => setMarkdownContent(v ?? '')}
              preview="edit"
              style={{ flex: 1, height: '100%' }}
              height="100%"
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              {markdownContent
                ? <MDEditor.Markdown source={markdownContent} className="!bg-transparent !text-sm" />
                : <p className="text-sm text-muted-foreground italic">No content yet.</p>
              }
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar — Tasks, AC, Linked Items */}
        <div className="w-72 shrink-0 overflow-y-auto">

          {/* Reviewed: AI Review block */}
          {isReviewed && milestone.review && (
            <div className="border-b border-border p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">AI Review</p>
              <div data-color-mode={resolvedTheme}>
                <MDEditor.Markdown source={milestone.review} className="!bg-transparent !text-xs" />
              </div>
            </div>
          )}

          <div className="p-4 space-y-5">

            {/* Tasks */}
            {totalTasks > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tasks</p>
                  <span className={`text-[10px] font-medium ${allDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    {completedCount}/{totalTasks}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="space-y-0.5 pt-1">
                  {sortedTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                      {task.completed
                        ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                        : <Circle size={13} className="text-muted-foreground shrink-0" />
                      }
                      <p className={`text-xs leading-snug ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Acceptance Criteria */}
            {milestone.acceptanceCriteria.length > 0 && (
              <section className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Acceptance Criteria</p>
                <ul className="space-y-0.5">
                  {milestone.acceptanceCriteria.map((ac, i) => (
                    <li key={i} className="flex items-start gap-2.5 px-2.5 py-1.5">
                      {ac.status === 'passed' && <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />}
                      {ac.status === 'rejected' && <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />}
                      {ac.status === 'pending' && <Circle size={13} className="text-muted-foreground mt-0.5 shrink-0" />}
                      <p className={`text-xs leading-snug ${ac.status === 'pending' ? 'text-foreground' : 'text-muted-foreground'} ${ac.status === 'rejected' ? 'line-through' : ''}`}>
                        {ac.title}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Linked Inbox Items */}
            {milestone.inboxItemIds.length > 0 && (
              <section className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Linked Inbox Items</p>
                <div className="space-y-1">
                  {milestone.inboxItemIds.map((iid) => {
                    const item = inboxItems.find((i) => i.id === iid)
                    if (!item) return null
                    return (
                      <div key={iid} className="flex items-center gap-2 py-1">
                        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                          {item.type}
                        </span>
                        <span className="text-xs text-foreground">{item.title}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>

      {/* ── Delete confirmation dialog ─────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Milestone</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{milestone.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation dialog ─────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Milestone</DialogTitle>
            <DialogDescription>
              {isInProgress
                ? 'This will stop all running agents and cancel the current iteration. The milestone can be re-edited and restarted later.'
                : 'This will remove the milestone from the scheduler queue. You can re-edit and resubmit it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep Running</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
