import * as net from 'net'
import * as fs from 'fs'
import { createLogger } from '../logger'
import type { ApiHandler } from './routes'

const log = createLogger('socket-adapter')

interface JsonRpcRequest {
  id: number | string
  method: string
  params: unknown[]
}

interface JsonRpcResponse {
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * Start a JSON-RPC server on a Unix domain socket.
 * Incoming requests map method → routes[method](...params).
 */
export function startSocketServer(
  routes: Record<string, ApiHandler>,
  socketPath: string
): net.Server {
  // Clean up stale socket file
  try {
    fs.unlinkSync(socketPath)
  } catch {
    // doesn't exist — fine
  }

  const server = net.createServer((conn) => {
    let buffer = ''

    conn.on('data', (chunk) => {
      buffer += chunk.toString()

      // Process all complete newline-delimited JSON messages
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim()
        buffer = buffer.slice(newlineIdx + 1)
        if (!line) continue

        handleMessage(line, conn, routes)
      }
    })

    conn.on('error', (err) => {
      log.warn('socket connection error', { error: String(err) })
    })
  })

  server.listen(socketPath, () => {
    log.info('bridge socket listening', { socketPath })
  })

  server.on('error', (err) => {
    log.error('bridge socket server error', { error: String(err) })
  })

  return server
}

async function handleMessage(
  line: string,
  conn: net.Socket,
  routes: Record<string, ApiHandler>
): Promise<void> {
  let req: JsonRpcRequest

  try {
    req = JSON.parse(line) as JsonRpcRequest
  } catch {
    const resp: JsonRpcResponse = { id: 0, error: { code: -32700, message: 'Parse error' } }
    conn.write(JSON.stringify(resp) + '\n')
    return
  }

  const handler = routes[req.method]
  if (!handler) {
    const resp: JsonRpcResponse = {
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    }
    conn.write(JSON.stringify(resp) + '\n')
    return
  }

  try {
    const params = Array.isArray(req.params) ? req.params : []
    const result = await handler(...params)
    const resp: JsonRpcResponse = { id: req.id, result: result ?? null }
    conn.write(JSON.stringify(resp) + '\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error(`bridge call error on "${req.method}":`, message)
    const resp: JsonRpcResponse = {
      id: req.id,
      error: { code: -32000, message },
    }
    conn.write(JSON.stringify(resp) + '\n')
  }
}
