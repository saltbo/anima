import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Plus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AgentChat } from '@/components/AgentChat'
import type { AgentChatHandle } from '@/components/AgentChat'
import { useProjects } from '@/store/projects'
import type { InboxItem, Milestone, MilestoneTask } from '@/types/index'
import type { SetupChatData } from '@/types/electron.d'

type Phase = 'setup' | 'chatting' | 'preview' | 'saving'

const TYPE_STYLES: Record<string, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

function extractJsonBlock(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\n([\s\S]*?)\n```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (
      typeof parsed.title === 'string' &&
      typeof parsed.description === 'string' &&
      Array.isArray(parsed.acceptanceCriteria) &&
      Array.isArray(parsed.tasks)
    ) {
      return parsed
    }
  } catch { /* invalid JSON */ }
  return null
}

interface ParsedMilestone {
  title: string
  description: string
  acceptanceCriteria: string[]
  tasks: Array<{ title: string; description?: string }>
  inboxItemIds: string[]
}

export function MilestoneNew() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const sessionId = project ? `${project.id}-milestone-planning` : ''

  const [phase, setPhase] = useState<Phase>('setup')
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [parsedData, setParsedData] = useState<ParsedMilestone | null>(null)
  const accTextRef = useRef('')
  const chatRef = useRef<AgentChatHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!project) return
    window.electronAPI.getInboxItems(project.path).then(setInboxItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const handleEvent = useCallback((event: SetupChatData) => {
    if (event.event === 'text') {
      accTextRef.current += event.text
    }
    if (event.event === 'done') {
      const json = extractJsonBlock(accTextRef.current)
      if (json) {
        setParsedData({
          title: json.title as string,
          description: json.description as string,
          acceptanceCriteria: json.acceptanceCriteria as string[],
          tasks: json.tasks as Array<{ title: string; description?: string }>,
          inboxItemIds: Array.isArray(json.inboxItemIds) ? (json.inboxItemIds as string[]) : [],
        })
        setPhase('preview')
      }
    }
  }, [])

  const handleStartPlanning = async () => {
    if (!project) return
    accTextRef.current = ''
    await window.electronAPI.startMilestonePlanningSession(
      sessionId,
      project.path,
      Array.from(selectedIds)
    )
    setPhase('chatting')
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    chatRef.current?.appendUserMessage(text)
    window.electronAPI.sendSetupMessage(sessionId, text)
    setInput('')
  }

  const handleSaveMilestone = async () => {
    if (!project || !parsedData) return
    setPhase('saving')

    const tasks: MilestoneTask[] = parsedData.tasks.map((t, i) => ({
      id: crypto.randomUUID(),
      title: t.title,
      description: t.description,
      completed: false,
      order: i,
    }))

    const milestone: Milestone = {
      id: crypto.randomUUID(),
      title: parsedData.title,
      description: parsedData.description,
      status: 'not-started',
      acceptanceCriteria: parsedData.acceptanceCriteria,
      tasks,
      inboxItemIds: parsedData.inboxItemIds,
      createdAt: new Date().toISOString(),
    }

    await window.electronAPI.saveMilestone(project.path, milestone)

    for (const iid of parsedData.inboxItemIds) {
      await window.electronAPI.updateInboxItem(project.path, iid, { milestoneId: milestone.id })
    }

    navigate(`/projects/${id}/milestones/${milestone.id}`)
  }

  if (!project) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
  }

  // ── Setup phase ──────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/projects/${id}/milestones`)}
            className="h-7 w-7"
          >
            <ArrowLeft size={14} />
          </Button>
          <h2 className="text-sm font-semibold text-foreground">New Milestone</h2>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Plan with AI</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Anima will help you structure your milestone. Optionally link inbox items.
              </p>
            </div>
          </div>

          {inboxItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Link Inbox Items
              </p>
              {inboxItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(item.id)
                        else next.delete(item.id)
                        return next
                      })
                    }}
                  />
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                    {item.type}
                  </span>
                  <span className="text-sm text-foreground truncate">{item.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border">
          <Button className="w-full" onClick={handleStartPlanning}>
            Start Planning →
          </Button>
        </div>
      </div>
    )
  }

  // ── Chatting phase ───────────────────────────────────────────────────────────
  if (phase === 'chatting') {
    const inputBar = (
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message… (⌘↵ to send)"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[36px] max-h-[120px] overflow-auto"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
        />
        <Button size="sm" onClick={handleSend} disabled={!input.trim()}>
          →
        </Button>
      </div>
    )

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/projects/${id}/milestones`)}
            className="h-7 w-7"
          >
            <ArrowLeft size={14} />
          </Button>
          <h2 className="text-sm font-semibold text-foreground">New Milestone</h2>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse ml-1" />
        </div>

        <AgentChat
          ref={chatRef}
          sessionId={sessionId}
          className="flex-1 min-h-0"
          onEvent={handleEvent}
          input={inputBar}
        />
      </div>
    )
  }

  // ── Saving phase ─────────────────────────────────────────────────────────────
  if (phase === 'saving') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Saving milestone…</p>
      </div>
    )
  }

  // ── Preview phase ────────────────────────────────────────────────────────────
  const data = parsedData!
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPhase('chatting')}
          className="h-7 w-7"
        >
          <ArrowLeft size={14} />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">Review Milestone</h2>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Title</label>
          <Input
            value={data.title}
            onChange={(e) => setParsedData((p) => p ? { ...p, title: e.target.value } : p)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Description</label>
          <Textarea
            rows={3}
            value={data.description}
            onChange={(e) => setParsedData((p) => p ? { ...p, description: e.target.value } : p)}
          />
        </div>

        {/* Acceptance Criteria */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Acceptance Criteria
          </label>
          {data.acceptanceCriteria.map((criterion, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-muted-foreground text-xs mt-0.5">•</span>
              <Input
                value={criterion}
                onChange={(e) => {
                  const next = [...data.acceptanceCriteria]
                  next[i] = e.target.value
                  setParsedData((p) => p ? { ...p, acceptanceCriteria: next } : p)
                }}
              />
              <button
                onClick={() => {
                  const next = data.acceptanceCriteria.filter((_, j) => j !== i)
                  setParsedData((p) => p ? { ...p, acceptanceCriteria: next } : p)
                }}
                className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setParsedData((p) => p ? { ...p, acceptanceCriteria: [...p.acceptanceCriteria, ''] } : p)
            }
          >
            <Plus size={12} className="mr-1.5" />
            Add Criterion
          </Button>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Tasks (Iterations)
          </label>
          {data.tasks.map((task, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-muted-foreground text-xs mt-2.5 shrink-0 w-4 text-right">{i + 1}.</span>
              <div className="flex-1 space-y-1">
                <Input
                  value={task.title}
                  placeholder="Task title"
                  onChange={(e) => {
                    const next = [...data.tasks]
                    next[i] = { ...next[i], title: e.target.value }
                    setParsedData((p) => p ? { ...p, tasks: next } : p)
                  }}
                />
                <Input
                  value={task.description ?? ''}
                  placeholder="Description (optional)"
                  className="text-xs"
                  onChange={(e) => {
                    const next = [...data.tasks]
                    next[i] = { ...next[i], description: e.target.value || undefined }
                    setParsedData((p) => p ? { ...p, tasks: next } : p)
                  }}
                />
              </div>
              <button
                onClick={() => {
                  const next = data.tasks.filter((_, j) => j !== i)
                  setParsedData((p) => p ? { ...p, tasks: next } : p)
                }}
                className="p-1 mt-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setParsedData((p) => p ? { ...p, tasks: [...p.tasks, { title: '', description: undefined }] } : p)
            }
          >
            <Plus size={12} className="mr-1.5" />
            Add Task
          </Button>
        </div>

        {/* Linked inbox items */}
        {data.inboxItemIds.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Linked Inbox Items
            </label>
            <div className="flex flex-wrap gap-1.5">
              {data.inboxItemIds.map((iid) => {
                const item = inboxItems.find((i) => i.id === iid)
                return item ? (
                  <span
                    key={iid}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                  >
                    {item.title}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-border flex gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase('chatting')}
        >
          ← Back to Chat
        </Button>
        <Button
          className="flex-1"
          onClick={handleSaveMilestone}
          disabled={!data.title.trim() || data.tasks.length === 0}
        >
          Save Milestone
        </Button>
      </div>
    </div>
  )
}
