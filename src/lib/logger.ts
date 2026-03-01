import log from 'electron-log/renderer'

export function createLogger(module: string) {
  return log.scope(module)
}

export default log
