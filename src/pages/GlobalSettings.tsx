import { useState, useEffect, useCallback } from 'react'
import { Monitor, Moon, Sun, Plus, Trash2, Server, RefreshCw, Download, RotateCcw, Check, Globe, Terminal, type LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/store/theme'
import { cn } from '@/lib/utils'
import type { McpServerEntry, UpdaterStatus } from '@/types/electron'

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

// ── MCP Servers ──────────────────────────────────────────────────────────────

function UpdateSection() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    return window.electronAPI.onUpdaterStatus(setStatus)
  }, [])

  const handleCheck = async () => {
    setStatus({ status: 'checking' })
    try {
      await window.electronAPI.checkForUpdates()
    } catch {
      setStatus({ status: 'error', error: 'Failed to check for updates' })
    }
  }

  const handleDownload = async () => {
    try {
      await window.electronAPI.downloadUpdate()
    } catch {
      setStatus({ status: 'error', error: 'Download failed' })
    }
  }

  const handleInstall = () => {
    window.electronAPI.installUpdate()
  }

  const s = status?.status

  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm text-foreground">Software Update</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {!status && 'Check for new versions.'}
          {s === 'checking' && 'Checking for updates...'}
          {s === 'up-to-date' && 'You\'re on the latest version.'}
          {s === 'available' && `Version ${status.version} is available.`}
          {s === 'downloading' && `Downloading... ${status.percent}%`}
          {s === 'ready' && `Version ${status.version} is ready to install.`}
          {s === 'error' && status.error}
        </p>
      </div>
      <div className="flex-shrink-0">
        {(!status || s === 'up-to-date' || s === 'error') && (
          <button
            onClick={handleCheck}
            disabled={s === 'checking'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
              s === 'checking' && 'opacity-50 cursor-not-allowed'
            )}
          >
            {s === 'up-to-date' ? <Check size={13} /> : <RefreshCw size={13} className={s === 'checking' ? 'animate-spin' : ''} />}
            Check
          </button>
        )}
        {s === 'available' && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download size={13} />
            Download
          </button>
        )}
        {s === 'downloading' && (
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        )}
        {s === 'ready' && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RotateCcw size={13} />
            Restart & Update
          </button>
        )}
      </div>
    </div>
  )
}

function serverDescription(entry: McpServerEntry): string {
  if (entry.url) return entry.url
  if (entry.command) return `${entry.command} ${entry.args?.join(' ') ?? ''}`
  return ''
}

function ServerTypeBadge({ entry }: { entry: McpServerEntry }) {
  const isHttp = entry.type === 'http' || entry.url
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
      isHttp ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'
    )}>
      {isHttp ? <Globe size={10} /> : <Terminal size={10} />}
      {isHttp ? 'HTTP' : 'STDIO'}
    </span>
  )
}

function McpServersSection() {
  const [servers, setServers] = useState<Record<string, McpServerEntry>>({})
  const [systemServers, setSystemServers] = useState<Record<string, McpServerEntry>>({})
  const [showForm, setShowForm] = useState(false)
  const [showSystemPicker, setShowSystemPicker] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formArgs, setFormArgs] = useState('')
  const [formEnv, setFormEnv] = useState('')
  const [error, setError] = useState('')

  const loadServers = useCallback(async () => {
    const result = await window.electronAPI.getMcpServers()
    setServers(result)
  }, [])

  const loadSystemServers = useCallback(async () => {
    const result = await window.electronAPI.getSystemMcpServers()
    setSystemServers(result)
  }, [])

  useEffect(() => { loadServers() }, [loadServers])

  const handleAdd = async () => {
    setError('')
    const name = formName.trim()
    if (!name) { setError('Name is required'); return }
    if (!formCommand.trim()) { setError('Command is required'); return }

    const args = formArgs.trim() ? formArgs.split(/\s+/) : []
    let env: Record<string, string> | undefined
    if (formEnv.trim()) {
      try {
        env = JSON.parse(formEnv)
      } catch {
        setError('Env must be valid JSON (e.g. {"KEY": "value"})')
        return
      }
    }

    try {
      await window.electronAPI.addMcpServer(name, { command: formCommand.trim(), args, env })
      setFormName('')
      setFormCommand('')
      setFormArgs('')
      setFormEnv('')
      setShowForm(false)
      loadServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleImportSystem = async (name: string, entry: McpServerEntry) => {
    try {
      await window.electronAPI.addMcpServer(name, entry)
      loadServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (name: string) => {
    await window.electronAPI.removeMcpServer(name)
    loadServers()
  }

  const handleShowSystemPicker = () => {
    loadSystemServers()
    setShowSystemPicker(true)
  }

  return (
    <div className="space-y-3">
      {/* Built-in anima server */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-muted-foreground" />
          <span className="text-sm text-foreground font-medium">anima</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            Built-in
          </span>
        </div>
      </div>

      {/* User-installed servers */}
      {Object.entries(servers).map(([name, entry]) => (
        <div key={name} className="flex items-center justify-between py-2 border-t border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">{name}</span>
              <ServerTypeBadge entry={entry} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {serverDescription(entry)}
            </p>
          </div>
          <button
            onClick={() => handleRemove(name)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {/* System Claude MCP servers picker */}
      {showSystemPicker && (
        <div className="border-t border-border pt-3 space-y-1">
          <p className="text-xs text-muted-foreground mb-2">
            Select from Claude system MCP servers (~/.claude.json):
          </p>
          {Object.keys(systemServers).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No system MCP servers found.</p>
          ) : (
            Object.entries(systemServers).map(([name, entry]) => {
              const alreadyAdded = name === 'anima' || name in servers
              return (
                <div key={name} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{name}</span>
                      <ServerTypeBadge entry={entry} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {serverDescription(entry)}
                    </p>
                  </div>
                  {alreadyAdded ? (
                    <span className="text-[10px] text-muted-foreground px-2 py-1">Added</span>
                  ) : (
                    <button
                      onClick={() => handleImportSystem(name, entry)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  )}
                </div>
              )
            })
          )}
          <button
            onClick={() => setShowSystemPicker(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors mt-2"
          >
            Close
          </button>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="border-t border-border pt-3 space-y-2">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Server name"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={formCommand}
            onChange={(e) => setFormCommand(e.target.value)}
            placeholder="Command (e.g. npx)"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={formArgs}
            onChange={(e) => setFormArgs(e.target.value)}
            placeholder="Args (space-separated)"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={formEnv}
            onChange={(e) => setFormEnv(e.target.value)}
            placeholder='Env JSON (optional, e.g. {"API_KEY": "..."})'
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Add Server
            </button>
            <button
              onClick={() => { setShowForm(false); setError('') }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : !showSystemPicker && (
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={14} />
            Add Manually
          </button>
          <button
            onClick={handleShowSystemPicker}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download size={14} />
            Import from Claude
          </button>
        </div>
      )}

      {error && !showForm && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function GlobalSettings() {
  return (
    <div className="py-6 space-y-6 max-w-2xl">
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

      <Section title="MCP Servers">
        <McpServersSection />
      </Section>

      <Section title="About">
        <div className="space-y-4">
          <Field label="Version" value={__APP_VERSION__} />
          <div className="border-t border-border pt-4">
            <UpdateSection />
          </div>
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
