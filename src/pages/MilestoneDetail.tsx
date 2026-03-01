import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, CheckCircle2, Circle, FileText, LayoutList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProjects } from '@/store/projects'
import type { Milestone, MilestoneStatus, InboxItem } from '@/types/index'

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  'draft': 'bg-muted text-muted-foreground',
  'ready': 'bg-blue-500/10 text-blue-600',
  'in-progress': 'bg-primary/10 text-primary',
  'completed': 'bg-green-500/10 text-green-600',
}

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  'draft': 'Draft',
  'ready': 'Ready',
  'in-progress': 'In Progress',
  'completed': 'Completed',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

const TYPE_STYLES: Record<string, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

function generateMarkdown(milestone: Milestone): string {
  const lines: string[] = [
    `# ${milestone.title}`,
    '',
    `**Status:** ${milestone.status}`,
    '',
    '## Description',
    '',
    milestone.description,
    '',
  ]
  if (milestone.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria', '')
    for (const c of milestone.acceptanceCriteria) lines.push(`- ${c}`)
    lines.push('')
  }
  if (milestone.tasks.length > 0) {
    lines.push('## Tasks', '')
    milestone.tasks.forEach((t, i) => {
      lines.push(`${i + 1}. [${t.completed ? 'x' : ' '}] ${t.title}`)
      if (t.description) lines.push(`   ${t.description}`)
    })
    lines.push('')
  }
  return lines.join('\n')
}

export function MilestoneDetail() {
  const { id, mid } = useParams<{ id: string; mid: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [markdownMode, setMarkdownMode] = useState(false)
  const [markdownContent, setMarkdownContent] = useState('')
  const [savingMarkdown, setSavingMarkdown] = useState(false)

  useEffect(() => {
    if (!project) return
    Promise.all([
      window.electronAPI.getMilestones(project.path),
      window.electronAPI.getInboxItems(project.path),
    ]).then(([milestones, items]) => {
      const m = milestones.find((ms) => ms.id === mid) ?? null
      setMilestone(m)
      if (m) setMarkdownContent(generateMarkdown(m))
      setInboxItems(items)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, mid])

  const handleTaskToggle = async (taskId: string) => {
    if (!project || !milestone) return
    const task = milestone.tasks.find((t) => t.id === taskId)
    if (!task) return
    const newCompleted = !task.completed
    const updated = { ...milestone, tasks: milestone.tasks.map((t) => (t.id === taskId ? { ...t, completed: newCompleted } : t)) }
    setMilestone(updated)
    setMarkdownContent(generateMarkdown(updated))
    await window.electronAPI.updateMilestoneTask(project.path, milestone.id, taskId, { completed: newCompleted })
  }

  const handleMarkReady = async () => {
    if (!project || !milestone) return
    const updated: Milestone = { ...milestone, status: 'ready' }
    await window.electronAPI.saveMilestone(project.path, updated)
    setMilestone(updated)
    setMarkdownContent(generateMarkdown(updated))
  }

  const handleMarkCompleted = async () => {
    if (!project || !milestone) return
    const updated: Milestone = { ...milestone, status: 'completed', completedAt: new Date().toISOString() }
    await window.electronAPI.saveMilestone(project.path, updated)
    setMilestone(updated)
    setMarkdownContent(generateMarkdown(updated))
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

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[80, 60, 100].map((w, i) => (
          <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
    )
  }

  if (!milestone) {
    return <div className="p-6 text-sm text-muted-foreground">Milestone not found.</div>
  }

  const completedCount = milestone.tasks.filter((t) => t.completed).length
  const allDone = completedCount === milestone.tasks.length && milestone.tasks.length > 0
  const isDraft = milestone.status === 'draft'

  return (
    <div className="p-6 space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">{milestone.title}</h2>
          <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[milestone.status as MilestoneStatus] ?? 'bg-muted text-muted-foreground'}`}>
            {STATUS_LABELS[milestone.status as MilestoneStatus] ?? milestone.status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{milestone.description}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Created {timeAgo(milestone.createdAt)}</span>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>

      {/* Draft actions */}
      {isDraft && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-4 py-2.5 gap-3">
          <span className="text-xs text-muted-foreground">Draft — refine before activating</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5"
              onClick={() => setMarkdownMode((v) => !v)}
            >
              {markdownMode ? <LayoutList size={12} /> : <FileText size={12} />}
              {markdownMode ? 'Structured' : 'Markdown'}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkReady}
            >
              Mark as Ready →
            </Button>
          </div>
        </div>
      )}

      {/* Markdown editor (draft only) */}
      {isDraft && markdownMode ? (
        <div className="space-y-2">
          <Textarea
            className="font-mono text-xs min-h-[320px] resize-y"
            value={markdownContent}
            onChange={(e) => setMarkdownContent(e.target.value)}
            spellCheck={false}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveMarkdown} disabled={savingMarkdown}>
              {savingMarkdown ? 'Saving…' : 'Save Markdown'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* All done banner */}
          {allDone && milestone.status !== 'completed' && (
            <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5">
              <span className="text-sm text-green-700 dark:text-green-400 font-medium">All tasks done</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-green-700 dark:text-green-400 hover:bg-green-500/20"
                onClick={handleMarkCompleted}
              >
                Mark as Completed
              </Button>
            </div>
          )}

          {/* Acceptance Criteria */}
          {milestone.acceptanceCriteria.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Acceptance Criteria
              </p>
              <ul className="space-y-1">
                {milestone.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-muted-foreground mt-0.5">•</span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tasks */}
          {milestone.tasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Tasks — {completedCount}/{milestone.tasks.length} completed
              </p>
              <div className="space-y-1">
                {milestone.tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskToggle(task.id)}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors text-left"
                  >
                    {task.completed
                      ? <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
                      : <Circle size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Linked Inbox Items */}
          {milestone.inboxItemIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Linked Inbox Items
              </p>
              <div className="space-y-1">
                {milestone.inboxItemIds.map((iid) => {
                  const item = inboxItems.find((i) => i.id === iid)
                  if (!item) return null
                  return (
                    <div key={iid} className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                        {item.type}
                      </span>
                      <span className="text-sm text-foreground">{item.title}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
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
    </div>
  )
}
