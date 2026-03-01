import { useParams } from 'react-router-dom'
import { useProjects } from '@/store/projects'

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>()
  const { projects, removeProject } = useProjects()
  const project = projects.find((p) => p.id === id)

  if (!project) return <div className="p-6 text-app-text-secondary">Project not found.</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-app-text-primary">Project Settings</h2>

      <Section title="General">
        <Field label="Project Name" value={project.name} />
        <Field label="Project Path" value={project.path} mono />
      </Section>

      <Section title="Wake Schedule">
        <p className="text-sm text-app-text-secondary">
          Wake schedule configuration will be available in M4.
        </p>
      </Section>

      <Section title="Human Review">
        <p className="text-sm text-app-text-secondary">
          Human review settings will be available in M5.
        </p>
      </Section>

      <Section title="Danger Zone">
        <div className="flex items-center justify-between p-4 border border-status-paused/30 rounded-lg bg-status-paused/5">
          <div>
            <p className="text-sm font-medium text-app-text-primary">Remove Project</p>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Remove this project from Anima. The project files will not be deleted.
            </p>
          </div>
          <button
            onClick={() => removeProject(project.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-status-paused border border-status-paused/30 hover:bg-status-paused/10 transition-colors"
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
      <h3 className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="bg-app-surface border border-app-border rounded-xl p-4 space-y-3">
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-app-text-secondary shrink-0">{label}</span>
      <span className={`text-sm text-app-text-primary truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}
