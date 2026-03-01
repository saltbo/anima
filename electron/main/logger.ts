import log from 'electron-log/main'

// Initialize IPC transport so renderer logs are forwarded to this file
log.initialize()

// Default level: debug in dev, info in prod
log.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

export function createLogger(module: string) {
  return log.scope(module)
}

export default log
