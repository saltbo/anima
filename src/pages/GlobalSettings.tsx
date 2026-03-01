export function GlobalSettings() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-app-text-primary">Global Settings</h2>

      <Section title="Appearance">
        <p className="text-sm text-app-text-secondary">
          Theme configuration will be available in a future update.
        </p>
      </Section>

      <Section title="About">
        <div className="space-y-1">
          <Field label="Version" value="0.1.0" />
          <Field label="Build" value="M1 — UI Foundation" />
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
      <div className="bg-app-surface border border-app-border rounded-xl p-4">
        {children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-app-text-secondary">{label}</span>
      <span className="text-sm text-app-text-primary">{value}</span>
    </div>
  )
}
