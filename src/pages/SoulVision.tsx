import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Pencil, Check, X, Sparkles } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Button } from '@/components/ui/button'
import { useProjects } from '@/store/projects'
import { useTheme } from '@/store/theme'
import { AgentChat } from '@/components/AgentChat'

type PageStatus = 'loading' | 'idle' | 'generating' | 'ready'

interface SoulTemplate {
  id: string
  name: string
  description: string
  content: string
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b border-border shrink-0" />
      <div className="flex-1 py-5 space-y-3">
        {[70, 50, 85, 40, 65].map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-muted animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

// ── Template picker ──────────────────────────────────────────────────────────

function TemplatePicker({
  templates,
  onPick,
  onGenerate,
}: {
  templates: SoulTemplate[]
  onPick: (id: string) => void
  onGenerate: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="text-center">
        <h2 className="text-base font-semibold text-foreground mb-1.5">Choose a Soul Template</h2>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          Pick the stack that matches your project. You can edit the result at any time.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 w-full max-w-sm">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary transition-colors text-xs">→</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 w-full max-w-sm">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={onGenerate}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles size={13} />
        Generate with AI
      </button>
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
  const [soul, setSoul] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<SoulTemplate[]>([])
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)

  // Load templates once
  useEffect(() => {
    window.electronAPI.listSoulTemplates().then((t) => setTemplates(t as SoulTemplate[]))
  }, [])

  useEffect(() => {
    if (!project) return
    window.electronAPI.readSetupFiles(project.path).then(({ soul: s }) => {
      if (s) {
        setSoul(s)
        setStatus('ready')
      } else {
        setStatus('idle')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const handlePickTemplate = useCallback(async (templateId: string) => {
    if (!project) return
    setStatus('generating')
    const sid = await window.electronAPI.startSoulAgent(project.id, project.path, templateId)
    setAgentSessionId(sid)
  }, [project])

  const handleGenerate = useCallback(async () => {
    if (!project) return
    setStatus('generating')
    const sid = await window.electronAPI.startSetupAgent(project.id, project.path, 'init')
    setAgentSessionId(sid)
  }, [project])

  const handleDone = useCallback(async () => {
    if (!project) return
    const { soul: s } = await window.electronAPI.readSetupFiles(project.path)
    setSoul(s ?? '')
    setStatus('ready')
  }, [project])

  const handleReinit = useCallback(() => {
    setAgentSessionId(null)
    setStatus('idle')
  }, [])

  const handleEdit = () => {
    setDraft(soul)
    setEditing(true)
  }

  const handleCancel = () => setEditing(false)

  const handleSave = useCallback(async () => {
    if (!project) return
    setSaving(true)
    await window.electronAPI.writeSetupFile(project.path, 'soul', draft)
    setSoul(draft)
    setEditing(false)
    setSaving(false)
  }, [project, draft])

  if (!project) {
    return <div className="py-6 text-sm text-muted-foreground">Project not found.</div>
  }

  if (status === 'loading') return <LoadingSkeleton />

  if (status === 'idle') {
    return <TemplatePicker templates={templates} onPick={handlePickTemplate} onGenerate={handleGenerate} />
  }

  if (status === 'generating') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2.5 h-10 border-b border-border shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-sm font-medium text-foreground">Giving this project a soul…</span>
        </div>
        <div className="flex-1 min-h-0">
          <AgentChat sessionId={agentSessionId ?? undefined} live className="h-full" onDone={handleDone} />
        </div>
      </div>
    )
  }

  // ready
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between pt-6 pb-4 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">Soul</span>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleCancel}>
                <X size={11} />Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saving}>
                <Check size={11} />{saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={handleReinit}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={10} />Re-initialize
              </button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleEdit}>
                <Pencil size={11} />Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden" data-color-mode={resolvedTheme}>
        {editing ? (
          <MDEditor value={draft} onChange={(v) => setDraft(v ?? '')} preview="live" height="100%" />
        ) : (
          <div className="w-full h-full overflow-auto py-5">
            <MDEditor.Markdown source={soul} />
          </div>
        )}
      </div>
    </div>
  )
}
