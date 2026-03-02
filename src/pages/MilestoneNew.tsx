import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentChat } from '@/components/AgentChat'
import { useProjects } from '@/store/projects'
import type { InboxItem } from '@/types/index'

type Phase = 'setup' | 'chatting'

const TYPE_STYLES: Record<string, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [starting, setStarting] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => {
    if (!project) return
    window.electronAPI.getInboxItems(project.path).then(setInboxItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  useEffect(() => {
    return () => { window.electronAPI.stopAgent(sessionId) }
  }, [sessionId])

  useEffect(() => {
    return window.electronAPI.onMilestonePlanningDone((sid, milestoneId) => {
      if (sid !== sessionId) return
      navigate(`/projects/${id}/milestones/${milestoneId}`)
    })
  }, [sessionId, id, navigate])

  const handleStartPlanning = async () => {
    if (!project || starting || !title.trim()) return
    setStarting(true)
    await window.electronAPI.startMilestonePlanning(
      sessionId,
      project.path,
      Array.from(selectedIds),
      title.trim(),
      description.trim()
    )
    setPhase('chatting')
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    window.electronAPI.sendAgentMessage(sessionId, text)
    setInput('')
  }

  if (!project) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
  }

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

        <div className="flex-1 overflow-auto p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MessageSquare size={15} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              Describe your feature or bug. AI will generate acceptance criteria.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ship user authentication"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this milestone achieve?"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {inboxItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
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
          <Button
            className="w-full"
            onClick={handleStartPlanning}
            disabled={starting || !title.trim()}
          >
            {starting ? 'Starting…' : 'Start Planning →'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Chatting phase ────────────────────────────────────────────────────────────
  const inputBar = (
    <div className="flex gap-2 items-end">
      <textarea
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
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse ml-1" />
      </div>

      <AgentChat
        agentKey={sessionId}
        className="flex-1 min-h-0"
        input={inputBar}
      />
    </div>
  )
}
