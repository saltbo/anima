import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil, Check, X, Sparkles, RefreshCw } from 'lucide-react'
import { useProjects } from '@/store/projects'
import { AgentChat } from '@/components/AgentChat'
import type { SetupChatData } from '@/types/electron.d'

type PageStatus = 'loading' | 'idle' | 'generating' | 'ready'

// ── Generating header ─────────────────────────────────────────────────────────

function GeneratingHeader() {
  return (
    <div className="flex items-center gap-2.5 px-5 h-10 border-b border-border shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
      <span className="text-sm font-medium text-foreground">Analyzing project…</span>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex h-full divide-x divide-border">
      {['Vision', 'Soul'].map((title) => (
        <div key={title} className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 h-9 border-b border-border">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
          </div>
          <div className="flex-1 px-4 py-4 space-y-2.5">
            {[80, 60, 90, 45, 70].map((w, i) => (
              <div key={i} className={`h-2.5 rounded bg-muted animate-pulse`} style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      ))}
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

// ── Doc panel (ready state) ───────────────────────────────────────────────────

function DocPanel({
  title,
  content,
  isEditing,
  editValue,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  title: string
  content: string
  isEditing: boolean
  editValue: string
  onEdit: () => void
  onEditChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-border shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onSave}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Check size={10} />
              Save
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={10} />
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onEdit}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={`Edit ${title}`}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <textarea
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            spellCheck={false}
            autoFocus
            className="w-full h-full px-4 py-3 text-xs font-mono leading-relaxed text-foreground bg-transparent resize-none focus:outline-none"
          />
        ) : (
          <pre className="w-full h-full overflow-auto px-4 py-3 text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── SoulVision page ───────────────────────────────────────────────────────────

export function SoulVision() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [status, setStatus] = useState<PageStatus>('loading')
  const [visionContent, setVisionContent] = useState('')
  const [soulContent, setSoulContent] = useState('')
  const [visionEditing, setVisionEditing] = useState(false)
  const [soulEditing, setSoulEditing] = useState(false)
  const [visionEdit, setVisionEdit] = useState('')
  const [soulEdit, setSoulEdit] = useState('')

  const sessionId = project ? `${project.id}-init` : ''

  // Stop the agent process when navigating away from this page
  useEffect(() => {
    return () => { window.electronAPI.stopAgentSession(sessionId) }
  }, [sessionId])

  // Load files on mount / project change
  useEffect(() => {
    if (!project) return
    window.electronAPI.readSetupFiles(project.path).then(({ vision, soul }) => {
      if (vision && soul) {
        setVisionContent(vision)
        setSoulContent(soul)
        setVisionEdit(vision)
        setSoulEdit(soul)
        setStatus('ready')
      } else {
        setStatus('idle')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // Agent writes files itself — on done, just read them back
  const handleAgentEvent = useCallback(async (event: SetupChatData) => {
    if (event.event === 'done') {
      if (!project) return
      const { vision, soul } = await window.electronAPI.readSetupFiles(project.path)
      setVisionContent(vision ?? '')
      setSoulContent(soul ?? '')
      setVisionEdit(vision ?? '')
      setSoulEdit(soul ?? '')
      setStatus('ready')
    } else if (event.event === 'error') {
      setStatus('idle')
    }
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

  const saveVision = useCallback(async () => {
    if (!project) return
    await window.electronAPI.writeSetupFile(project.path, 'vision', visionEdit)
    setVisionContent(visionEdit)
    setVisionEditing(false)
  }, [project, visionEdit])

  const saveSoul = useCallback(async () => {
    if (!project) return
    await window.electronAPI.writeSetupFile(project.path, 'soul', soulEdit)
    setSoulContent(soulEdit)
    setSoulEditing(false)
  }, [project, soulEdit])

  if (!project) {
    return <div className="p-6 text-sm text-muted-foreground">Project not found.</div>
  }

  if (status === 'loading') return <LoadingSkeleton />
  if (status === 'idle') return <InitState onInit={handleInit} />
  if (status === 'generating') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <GeneratingHeader />
        <div className="flex-1 min-h-0">
          <AgentChat
            sessionId={sessionId}
            className="h-full"
            onEvent={handleAgentEvent}
          />
        </div>
      </div>
    )
  }

  // ── Ready ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Subtle re-init toolbar */}
      <div className="flex items-center justify-end px-4 h-8 border-b border-border shrink-0">
        <button
          onClick={handleReinit}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={10} />
          Re-initialize
        </button>
      </div>

      {/* Two panels */}
      <div className="flex flex-1 divide-x divide-border overflow-hidden">
        <DocPanel
          title="Vision"
          content={visionContent}
          isEditing={visionEditing}
          editValue={visionEdit}
          onEdit={() => { setVisionEdit(visionContent); setVisionEditing(true) }}
          onEditChange={setVisionEdit}
          onSave={saveVision}
          onCancel={() => setVisionEditing(false)}
        />
        <DocPanel
          title="Soul"
          content={soulContent}
          isEditing={soulEditing}
          editValue={soulEdit}
          onEdit={() => { setSoulEdit(soulContent); setSoulEditing(true) }}
          onEditChange={setSoulEdit}
          onSave={saveSoul}
          onCancel={() => setSoulEditing(false)}
        />
      </div>
    </div>
  )
}
