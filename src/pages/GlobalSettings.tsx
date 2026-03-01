import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/store/theme'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function ThemePicker() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex gap-2">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
            theme === value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
          )}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  )
}

export function GlobalSettings() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-foreground">Global Settings</h2>

      <Section title="Appearance">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose between light, dark, or follow your system setting.
            </p>
          </div>
          <ThemePicker />
        </div>
      </Section>

      <Section title="About">
        <div className="space-y-2">
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
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="bg-card border border-border rounded-xl p-4">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}
