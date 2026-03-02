import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useProjects } from '@/store/projects'

type Step = 'onboarding' | 'vision' | 'soul' | 'complete'
type Phase = 'form' | 'generating' | 'preview'

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:\w+)?\n([\s\S]+?)```/)
  return m ? m[1].trim() : null
}

// ── Field definitions ─────────────────────────────────────────────────────────

const VISION_FIELDS = [
  { key: 'name',     label: 'Project Name',  placeholder: 'e.g. EchoLingo',                                    multiline: false },
  { key: 'identity', label: 'Identity',      placeholder: 'What is this project? (one sentence)',               multiline: true  },
  { key: 'problem',  label: 'Problem',       placeholder: 'What specific pain point does it solve?',           multiline: true  },
  { key: 'audience', label: 'Audience',      placeholder: 'Who is the target user?',                           multiline: true  },
  { key: 'goal',     label: 'Long-term Goal',placeholder: 'What does the end state look like?',                multiline: true  },
]

const SOUL_FIELDS = [
  { key: 'principles', label: 'Principles',       placeholder: '3-5 operating principles, one per line',           multiline: true },
  { key: 'tech',       label: 'Tech Preferences', placeholder: 'Language, framework, toolchain, versions',         multiline: true },
  { key: 'redlines',   label: 'Red Lines',        placeholder: 'Absolute no-go zones and constraints',            multiline: true },
  { key: 'quality',    label: 'Quality Bar',       placeholder: 'Lint, type checking, test coverage requirements', multiline: true },
  { key: 'iteration',  label: 'Iteration Style',   placeholder: 'How you ship: pace, step size, release strategy', multiline: true },
]

function buildMessage(type: 'vision' | 'soul', fields: Record<string, string>): string {
  if (type === 'vision') {
    return `Project Name: ${fields.name}
Identity: ${fields.identity}
Problem: ${fields.problem}
Audience: ${fields.audience}
Long-term Goal: ${fields.goal}

Please generate the complete VISION.md file now.`
  }
  return `Principles:
${fields.principles}

Tech Preferences: ${fields.tech}
Red Lines: ${fields.redlines}
Quality Bar: ${fields.quality}
Iteration Style: ${fields.iteration}

Please generate the complete soul.md file now.`
}

// ── SetupForm ─────────────────────────────────────────────────────────────────

function SetupForm({
  projectId,
  projectPath,
  type,
  onDone,
}: {
  projectId: string
  projectPath: string
  type: 'vision' | 'soul'
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('form')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [streamText, setStreamText] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [error, setError] = useState('')
  const accTextRef = useRef('')
  const sessionId = `${projectId}-${type}`
  const fieldDefs = type === 'vision' ? VISION_FIELDS : SOUL_FIELDS
  const allFilled = fieldDefs.every((f) => fields[f.key]?.trim())
  const title = type === 'vision' ? 'Vision' : 'Soul'
  const step = type === 'vision' ? 'Step 1 of 2' : 'Step 2 of 2'
  const filename = type === 'vision' ? 'VISION.md' : 'soul.md'

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.electronAPI.stopAgent(sessionId)
    }
  }, [sessionId])

  // Listen to IPC events while generating
  useEffect(() => {
    if (phase !== 'generating') return
    const unsub = window.electronAPI.onAgentEvents((key, incoming) => {
      if (key !== sessionId) return
      for (const ev of incoming as Array<{ event: string; role?: string; text?: string; message?: string }>) {
        if (ev.event === 'text' && ev.role === 'assistant' && ev.text) {
          accTextRef.current += ev.text
          setStreamText(accTextRef.current)
        } else if (ev.event === 'done') {
          const extracted = extractCodeBlock(accTextRef.current)
          setPreviewContent(extracted ?? accTextRef.current)
          setPhase('preview')
        } else if (ev.event === 'error') {
          setError(ev.message ?? 'Unknown error')
          setPhase('form')
        }
      }
    })
    return unsub
  }, [phase, sessionId])

  const handleGenerate = useCallback(async () => {
    setError('')
    accTextRef.current = ''
    setStreamText('')
    setPhase('generating')
    await window.electronAPI.startSetupAgent(sessionId, projectPath, type)
    window.electronAPI.sendAgentMessage(sessionId, buildMessage(type, fields))
  }, [sessionId, projectPath, type, fields])

  const handleConfirm = useCallback(async () => {
    await window.electronAPI.writeSetupFile(projectPath, type, previewContent)
    onDone()
  }, [projectPath, type, previewContent, onDone])

  const handleRegenerate = useCallback(() => {
    window.electronAPI.stopAgent(sessionId)
    setPhase('form')
  }, [sessionId])

  const setField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{step}</p>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {phase === 'form' && (type === 'vision'
            ? 'Fill in your project\'s identity and direction.'
            : 'Define your project\'s engineering principles.')}
          {phase === 'generating' && `Generating ${filename}…`}
          {phase === 'preview' && `Review ${filename} before saving.`}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── Form phase ── */}
        {phase === 'form' && (
          <div className="space-y-5 max-w-xl">
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {fieldDefs.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {f.label}
                  <span className="text-destructive ml-0.5">*</span>
                </label>
                {f.multiline ? (
                  <textarea
                    rows={3}
                    value={fields[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={fields[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}
            <button
              onClick={handleGenerate}
              disabled={!allFilled}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Generate {title} →
            </button>
          </div>
        )}

        {/* ── Generating phase ── */}
        {phase === 'generating' && (
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Claude is writing your {title} file…
            </div>
            {streamText && (
              <pre className="whitespace-pre-wrap text-xs font-mono text-foreground/80 bg-muted/30 rounded-lg p-4 border border-border leading-relaxed">
                {streamText}
              </pre>
            )}
          </div>
        )}

        {/* ── Preview phase ── */}
        {phase === 'preview' && (
          <div className="max-w-xl space-y-4">
            <p className="text-sm text-muted-foreground">
              Review and edit if needed, then save.
            </p>
            <textarea
              rows={20}
              value={previewContent}
              onChange={(e) => setPreviewContent(e.target.value)}
              className="w-full px-3 py-3 rounded-lg border border-border bg-muted/20 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Save {filename}
              </button>
              <button
                onClick={handleRegenerate}
                className="px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-accent transition-colors"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── ProjectSetup page ─────────────────────────────────────────────────────────

export function ProjectSetup() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const project = projects.find((p) => p.id === id)
  const stepParam = searchParams.get('step') as 'vision' | 'soul' | null

  const getInitialStep = (): Step => {
    if (stepParam === 'vision') return 'vision'
    if (stepParam === 'soul') return 'soul'
    return 'onboarding'
  }

  const [step, setStep] = useState<Step>(getInitialStep)

  useEffect(() => {
    if (step === 'complete') {
      const timer = setTimeout(() => navigate(`/projects/${id}`), 1000)
      return () => clearTimeout(timer)
    }
  }, [step, id, navigate])

  if (!project) {
    return <div className="p-6 text-muted-foreground">Project not found.</div>
  }

  if (step === 'onboarding') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl">✦</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-3">Set up {project.name}</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Before Anima can manage this project, we need two things:
          </p>
          <div className="text-left space-y-3 mb-8">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-medium text-foreground mb-1">Vision</p>
              <p className="text-xs text-muted-foreground">
                Defines what the project is, the problem it solves, who it&apos;s for, and where
                it&apos;s going.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-medium text-foreground mb-1">Soul</p>
              <p className="text-xs text-muted-foreground">
                Establishes operating principles, tech preferences, red lines, quality bar, and
                iteration style for all future AI agents.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStep('vision')}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Get Started
          </button>
        </div>
      </div>
    )
  }

  if (step === 'vision') {
    return (
      <SetupForm
        projectId={project.id}
        projectPath={project.path}
        type="vision"
        onDone={() => {
          if (stepParam === 'vision') navigate(`/projects/${id}`)
          else setStep('soul')
        }}
      />
    )
  }

  if (step === 'soul') {
    return (
      <SetupForm
        projectId={project.id}
        projectPath={project.path}
        type="soul"
        onDone={() => setStep('complete')}
      />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="max-w-sm">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
          <span className="text-2xl">✓</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Setup complete!</h1>
        <p className="text-sm text-muted-foreground">Redirecting to your project dashboard…</p>
      </div>
    </div>
  )
}
