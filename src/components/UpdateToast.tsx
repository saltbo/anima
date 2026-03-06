import { useEffect, useState } from 'react'
import { Download, RotateCcw, X } from 'lucide-react'
import type { UpdaterStatus } from '@/types/electron'

export function UpdateToast() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return window.electronAPI.onUpdaterStatus((s) => {
      setStatus(s)
      setDismissed(false)
    })
  }, [])

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
  const visible = !dismissed && (s === 'available' || s === 'downloading' || s === 'ready')

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-popover shadow-lg" style={{ animation: 'update-toast-in 0.3s ease-out' }}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          {s === 'available' && (
            <>
              <p className="text-sm font-medium text-foreground">New version available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Version {status.version} is ready to download.
              </p>
              <button
                onClick={handleDownload}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download size={13} />
                Download
              </button>
            </>
          )}
          {s === 'downloading' && (
            <>
              <p className="text-sm font-medium text-foreground">Downloading update...</p>
              <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${status.percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{status.percent}%</p>
            </>
          )}
          {s === 'ready' && (
            <>
              <p className="text-sm font-medium text-foreground">Update ready</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Version {status.version} has been downloaded. Restart to apply.
              </p>
              <button
                onClick={handleInstall}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RotateCcw size={13} />
                Restart Now
              </button>
            </>
          )}
        </div>
        {s !== 'downloading' && (
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
