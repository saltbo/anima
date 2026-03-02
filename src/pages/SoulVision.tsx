import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Sparkles, RefreshCw, Pencil, Check, X } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { useTheme } from '@/store/theme'
import { AgentChat } from '@/components/AgentChat'

type PageStatus = 'loading' | 'idle' | 'confirm' | 'generating' | 'ready'
type Tab = 'vision' | 'soul'

// ── Form field definitions ───────────────────────────────────────────────────

const HINT_FIELDS = [
  { key: 'identity', label: 'Identity',       placeholder: 'What is this project? (one sentence)', group: 'Vision' },
  { key: 'problem',  label: 'Problem',        placeholder: 'What specific pain point does it solve?', group: 'Vision' },
  { key: 'audience', label: 'Audience',        placeholder: 'Who is the target user?', group: 'Vision' },
  { key: 'goal',     label: 'Long-term Goal',  placeholder: 'What does the end state look like?', group: 'Vision' },
  { key: 'redlines', label: 'Red Lines',       placeholder: 'Absolute constraints the agent can\'t detect from code', group: 'Soul' },
  { key: 'notes',    label: 'Additional Notes', placeholder: 'Anything else you want the agent to know', group: 'Soul' },
] as const

function buildUserContext(fields: Record<string, string>): string | undefined {
  const lines: string[] = []
  for (const f of HINT_FIELDS) {
    const val = fields[f.key]?.trim()
    if (val) lines.push(`${f.label}: ${val}`)
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 h-10 border-b border-border shrink-0">
        {['Vision', 'Soul'].map((t) => (
          <div key={t} className="h-5 w-14 rounded bg-muted animate-pulse" />
        ))}
      </div>
      <div className="flex-1 px-6 py-5 space-y-3">
        {[70, 50, 85, 40, 65].map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

// ── Init state ───────────────────────────────────────────────────────────────

function InitState({ onInit }: { onInit: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles size={22} className="text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1.5">Initialize Soul & Vision</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          Anima will scan your project, understand its purpose and structure,
          and automatically generate both documents. You can edit them after.
        </p>
      </div>
      <button
        onClick={onInit}
        className="px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Auto-Initialize
      </button>
    </div>
  )
}

// ── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  onStart,
  onCancel,
}: {
  onStart: (userContext?: string) => void
  onCancel: () => void
}) {
  const [fields, setFields] = useState<Record<string, string>>({})

  const setField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleStart = () => {
    onStart(buildUserContext(fields))
  }

  const handleSkip = () => {
    onStart(undefined)
  }

  let currentGroup = ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Provide Context (Optional)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Help the agent generate more accurate documents, or skip to auto-analyze.
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {HINT_FIELDS.map((f) => {
            const showGroup = f.group !== currentGroup
            currentGroup = f.group
            return (
              <div key={f.key}>
                {showGroup && (
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {f.group}
                  </p>
                )}
                <label className="block text-xs font-medium text-foreground mb-1">{f.label}</label>
                <textarea
                  rows={2}
                  value={fields[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border shrink-0">
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Skip & Auto-Analyze
          </button>
          <button
            onClick={handleStart}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Start with Context
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SoulVision page ──────────────────────────────────────────────────────────

export function SoulVision() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const { resolvedTheme } = useTheme()
  const project = projects.find((p) => p.id === id)

  const [status, setStatus] = useState<PageStatus>('loading')
  const [activeTab, setActiveTab] = useState<Tab>('vision')
  const [vision, setVision] = useState('')
  const [soul, setSoul] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const sessionId = project ? `${project.id}-init` : ''

  useEffect(() => {
    return () => { window.electronAPI.stopAgent(sessionId) }
  }, [sessionId])

  useEffect(() => {
    if (!project) return
    window.electronAPI.readSetupFiles(project.path).then(({ vision: v, soul: s }) => {
      if (v && s) {
        setVision(v)
        setSoul(s)
        setStatus('ready')
      } else {
        setStatus('idle')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const handleDone = useCallback(async () => {
    if (!project) return
    const { vision: v, soul: s } = await window.electronAPI.readSetupFiles(project.path)
    setVision(v ?? '')
    setSoul(s ?? '')
    setStatus('ready')
  }, [project])

  const handleOpenConfirm = useCallback(() => {
    setStatus('confirm')
  }, [])

  const handleCancelConfirm = useCallback(() => {
    setStatus('idle')
  }, [])

  const handleStartGeneration = useCallback(async (userContext?: string) => {
    if (!project) return
    setStatus('generating')
    await window.electronAPI.startSetupAgent(sessionId, project.path, 'init', userContext)
  }, [project, sessionId])

  const handleReinit = useCallback(() => {
    window.electronAPI.stopAgent(sessionId)
    setStatus('idle')
  }, [sessionId])

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setEditing(false)
  }

  const handleEdit = () => {
    setDraft(activeTab === 'vision' ? vision : soul)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
  }

  const handleSave = useCallback(async () => {
    if (!project) return
    setSaving(true)
    await window.electronAPI.writeSetupFile(project.path, activeTab, draft)
    if (activeTab === 'vision') setVision(draft)
    else setSoul(draft)
    setEditing(false)
    setSaving(false)
  }, [project, activeTab, draft])

  if (!project) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
  }

  if (status === 'loading') return <LoadingSkeleton />
  if (status === 'idle') return <InitState onInit={handleOpenConfirm} />

  if (status === 'confirm') {
    return (
      <>
        <InitState onInit={handleOpenConfirm} />
        <ConfirmDialog onStart={handleStartGeneration} onCancel={handleCancelConfirm} />
      </>
    )
  }

  if (status === 'generating') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 h-10 border-b border-border shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-sm font-medium text-foreground">Analyzing project…</span>
        </div>
        <div className="flex-1 min-h-0">
          <AgentChat agentKey={sessionId} className="h-full" onDone={handleDone} />
        </div>
      </div>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'vision', label: 'Vision' },
    { key: 'soul', label: 'Soul' },
  ]

  const content = activeTab === 'vision' ? vision : soul

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleCancel}>
                <X size={11} />
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saving}>
                <Check size={11} />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={handleReinit}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={10} />
                Re-initialize
              </button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleEdit}>
                <Pencil size={11} />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden" data-color-mode={resolvedTheme}>
        {editing ? (
          <MDEditor
            value={draft}
            onChange={(v) => setDraft(v ?? '')}
            preview="live"
            height="100%"
          />
        ) : (
          <div className="w-full h-full overflow-auto px-6 py-5">
            <MDEditor.Markdown source={content} />
          </div>
        )}
      </div>
    </div>
  )
}
