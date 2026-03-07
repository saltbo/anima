import { vi } from 'vitest'

// Mock electron-log to prevent tests from writing to the production
// log file at ~/Library/Logs/Anima/main.log.
// Tests run in plain Node.js (vitest), not Electron, so there is no
// app.setName('Anima-Dev') — electron-log falls back to the default
// "Anima" app name and pollutes the production log.
vi.mock('electron-log/main', () => {
  const noop = () => {}
  const noopLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    verbose: noop,
    silly: noop,
    scope: () => noopLogger,
    initialize: noop,
    transports: {
      file: { level: 'info' },
      console: { level: 'info' },
    },
  }
  return { default: noopLogger }
})
