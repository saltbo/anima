import * as fs from 'fs'
import type { BrowserWindow } from 'electron'
import type { AgentEvent } from '../../../src/types/agent'
import { findSessionFile, readEventsFromFile } from './claude-code/parser'
import { createLogger } from '../logger'

const log = createLogger('session-watcher')

interface WatchEntry {
  filePath: string
  watcher: fs.FSWatcher
  offset: number
}

/**
 * Watches session JSONL files for changes and pushes new events to the renderer
 * via `session:event` IPC channel. Each event is sent individually so the UI
 * can apply it incrementally.
 */
export class SessionWatcher {
  private watches = new Map<string, WatchEntry>()

  constructor(private getWindow: () => BrowserWindow | null) {}

  /**
   * Start watching a session. Returns the initial batch of events (history).
   * Subsequent events are pushed via IPC.
   */
  watch(sessionId: string): AgentEvent[] {
    // Already watching — just return current history
    if (this.watches.has(sessionId)) {
      const entry = this.watches.get(sessionId)!
      const { events } = readEventsFromFile(entry.filePath, 0)
      return events
    }

    const filePath = findSessionFile(sessionId)
    if (!filePath) return []

    // Read all existing events as initial history
    const { events, newOffset } = readEventsFromFile(filePath, 0)

    // Start fs.watch for incremental updates
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const watcher = fs.watch(filePath, () => {
      // Debounce rapid writes — JSONL files get many small appends
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => this.onFileChanged(sessionId), 50)
    })

    watcher.on('error', (err) => {
      log.warn('fs.watch error', { sessionId, error: String(err) })
      this.unwatch(sessionId)
    })

    this.watches.set(sessionId, { filePath, watcher, offset: newOffset })
    return events
  }

  /** Stop watching a session. */
  unwatch(sessionId: string): void {
    const entry = this.watches.get(sessionId)
    if (!entry) return
    entry.watcher.close()
    this.watches.delete(sessionId)
  }

  /** Stop all watchers (app shutdown). */
  dispose(): void {
    for (const [id] of this.watches) this.unwatch(id)
  }

  private onFileChanged(sessionId: string): void {
    const entry = this.watches.get(sessionId)
    if (!entry) return

    const { events, newOffset } = readEventsFromFile(entry.filePath, entry.offset)
    if (events.length === 0) return

    entry.offset = newOffset

    const win = this.getWindow()
    if (!win || win.isDestroyed()) return

    for (const event of events) {
      win.webContents.send('session:event', { sessionId, event })
    }
  }
}
