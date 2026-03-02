import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Sparkles, RefreshCw, Pencil, Check, X } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { useTheme } from '@/store/theme'
import { AgentChat } from '@/components/AgentChat'

type PageStatus = 'loading' | 'idle' | 'generating' | 'ready'
type Tab = 'vision' | 'soul'

// ── Loading skeleton ──────────────────────────────────────────────────────────

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

// ── Init state ────────────────────────────────────────────────────────────────

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

// ── SoulVision page ───────────────────────────────────────────────────────────

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
    return () => { window.electronAPI.stopAgentSession(sessionId) }
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

  const handleInit = useCallback(async () => {
    if (!project) return
    setStatus('generating')
    await window.electronAPI.startSetupSession(sessionId, project.path, 'init')
  }, [project, sessionId])

  const handleReinit = useCallback(() => {
    window.electronAPI.stopAgentSession(sessionId)
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
  if (status === 'idle') return <InitState onInit={handleInit} />
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
