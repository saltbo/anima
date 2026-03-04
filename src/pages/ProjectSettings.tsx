import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjects } from '@/store/projects'
import { BookOpen, Plus, X, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { WakeSchedule, WakeScheduleMode } from '@/types/index'

const MODE_OPTIONS: { value: WakeScheduleMode; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual', description: 'Only wake when you click "Wake Now"' },
  { value: 'interval', label: 'Interval', description: 'Wake every N minutes automatically' },
  { value: 'times', label: 'Specific Times', description: 'Wake at specific times each day' },
]

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>()
  const { projects, removeProject } = useProjects()
  const navigate = useNavigate()
  const project = projects.find((p) => p.id === id)

  const [schedule, setSchedule] = useState<WakeSchedule>({ mode: 'manual', intervalMinutes: null, times: [] })
  const [saving, setSaving] = useState(false)
  const [newTime, setNewTime] = useState('09:00')

  // Initialize schedule from project data
  useEffect(() => {
    if (project) {
      setSchedule(project.wakeSchedule)
    }
  }, [project])

  if (!project) return <div className="py-6 text-muted-foreground">Project not found.</div>

  const handleRemove = async () => {
    await removeProject(project.id)
    navigate('/')
  }

  const handleSaveSchedule = async () => {
    setSaving(true)
    await window.electronAPI.updateWakeSchedule(project.id, schedule)
    setSaving(false)
  }

  const handleAddTime = () => {
    if (!newTime || schedule.times.includes(newTime)) return
    const updated = [...schedule.times, newTime].sort()
    setSchedule({ ...schedule, times: updated })
  }

  const handleRemoveTime = (time: string) => {
    setSchedule({ ...schedule, times: schedule.times.filter((t) => t !== time) })
  }

  return (
    <div className="py-6 space-y-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-foreground">Project Settings</h2>

      <Section title="General">
        <Field label="Project Name" value={project.name} />
        <Field label="Project Path" value={project.path} mono />
      </Section>

      <Section title="Wake Schedule">
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="space-y-2">
            {MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  schedule.mode === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-foreground/20'
                }`}
              >
                <input
                  type="radio"
                  name="wake-mode"
                  value={opt.value}
                  checked={schedule.mode === opt.value}
                  onChange={() => setSchedule({ ...schedule, mode: opt.value })}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Interval config */}
          {schedule.mode === 'interval' && (
            <div className="flex items-center gap-3 pl-1">
              <span className="text-sm text-muted-foreground">Every</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={schedule.intervalMinutes ?? 60}
                onChange={(e) => setSchedule({ ...schedule, intervalMinutes: Math.max(1, parseInt(e.target.value) || 60) })}
                className="w-20 h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          )}

          {/* Times config */}
          {schedule.mode === 'times' && (
            <div className="space-y-3 pl-1">
              {schedule.times.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {schedule.times.map((time) => (
                    <span
                      key={time}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-sm font-mono text-foreground"
                    >
                      {time}
                      <button
                        onClick={() => handleRemoveTime(time)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 cursor-pointer" onClick={handleAddTime}>
                  <Plus size={12} />
                  Add Time
                </Button>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end pt-1">
            <Button size="sm" className="h-8 text-xs gap-1.5 cursor-pointer" onClick={handleSaveSchedule} disabled={saving}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Schedule
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Completion Behavior">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-merge on completion</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {project.autoMerge
                ? 'Milestone branches are automatically squash-merged to main when all acceptance criteria pass.'
                : 'Milestones pause for human review before merging. You can accept, request changes, or rollback.'}
            </p>
          </div>
          <Switch
            checked={project.autoMerge}
            onCheckedChange={(checked) => window.electronAPI.updateAutoMerge(project.id, checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-approve planned milestones</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {project.autoApprove
                ? 'Milestones planned by Soul are automatically approved and enter execution after review.'
                : 'Milestones planned by Soul wait for your manual approval before execution.'}
            </p>
          </div>
          <Switch
            checked={project.autoApprove}
            onCheckedChange={(checked) => window.electronAPI.updateAutoApprove(project.id, checked)}
          />
        </div>
      </Section>

      <Section title="Soul">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Soul</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engineering principles and standards</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/projects/${id}/soul`)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-accent transition-colors"
          >
            Recreate
          </button>
        </div>
      </Section>

      <Section title="Danger Zone">
        <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
          <div>
            <p className="text-sm font-medium text-foreground">Remove Project</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Remove this project from Anima. The project files will not be deleted.
            </p>
          </div>
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span
        className={`text-sm text-foreground truncate ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
