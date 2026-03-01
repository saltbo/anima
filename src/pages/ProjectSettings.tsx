import { useParams, useNavigate } from 'react-router-dom'
import { useProjects } from '@/store/projects'
import { FileText, BookOpen } from 'lucide-react'

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>()
  const { projects, removeProject } = useProjects()
  const navigate = useNavigate()
  const project = projects.find((p) => p.id === id)

  if (!project) return <div className="p-6 text-muted-foreground">Project not found.</div>

  const handleRemove = async () => {
    await removeProject(project.id)
    navigate('/')
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-foreground">Project Settings</h2>

      <Section title="General">
        <Field label="Project Name" value={project.name} />
        <Field label="Project Path" value={project.path} mono />
      </Section>

      <Section title="Wake Schedule">
        <p className="text-sm text-muted-foreground">
          Wake schedule configuration will be available in M4.
        </p>
      </Section>

      <Section title="Human Review">
        <p className="text-sm text-muted-foreground">
          Human review settings will be available in M5.
        </p>
      </Section>

      <Section title="Vision &amp; Soul">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Vision</p>
              <p className="text-xs text-muted-foreground mt-0.5">Project identity and goals</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/projects/${id}/setup?step=vision`)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-accent transition-colors"
          >
            Recreate
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Soul</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engineering principles and standards</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/projects/${id}/setup?step=soul`)}
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
