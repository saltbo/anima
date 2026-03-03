import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { AgentEvent } from '../../../../src/types/agent'

// ── CLI path resolution ───────────────────────────────────────────────────────

export function resolveCliPath(command: string): string | null {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, '.local', 'bin', command),
    path.join(homeDir, '.volta', 'bin', command),
    path.join(homeDir, '.npm', 'bin', command),
    path.join('/usr', 'local', 'bin', command),
    path.join('/opt', 'homebrew', 'bin', command),
    path.join('/usr', 'bin', command),
    path.join('/bin', command),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  try {
    const result = execSync(`which ${command}`, { encoding: 'utf8' }).trim()
    if (result) return result
  } catch { /* not found */ }
  return null
}

// ── stdout parser (real-time process events) ──────────────────────────────────

type ContentEntry = {
  type: string
  text?: string
  thinking?: string
  name?: string
  input?: unknown
  id?: string
  content?: unknown
  is_error?: boolean
}

export function parseLine(line: string, onEvent: (event: AgentEvent) => void): void {
  if (!line.trim()) return
  try {
    const json = JSON.parse(line)

    if (json.type === 'error' || json.error) {
      onEvent({ event: 'error', message: String(json.error?.message || json.error || json.message || 'Unknown error') })
      return
    }
    if (json.type === 'system' && json.subtype === 'init') {
      onEvent({ event: 'system', model: json.model ?? '', sessionId: json.session_id ?? '' })
      return
    }
    if (json.type === 'rate_limit_event') {
      onEvent({ event: 'rate_limit', utilization: json.rate_limit_info?.utilization ?? 0 })
      return
    }
    if (json.type === 'assistant' && Array.isArray(json.message?.content)) {
      for (const entry of json.message.content as ContentEntry[]) {
        if (entry.type === 'thinking' && entry.thinking)
          onEvent({ event: 'thinking', thinking: entry.thinking })
        if (entry.type === 'text' && entry.text)
          onEvent({ event: 'text', text: entry.text, role: 'assistant' })
        if (entry.type === 'tool_use' && entry.name)
          onEvent({ event: 'tool_use', toolName: entry.name, toolInput: JSON.stringify(entry.input ?? {}), toolCallId: entry.id ?? '' })
      }
    }
    if (json.type === 'user' && Array.isArray(json.message?.content)) {
      for (const entry of json.message.content as ContentEntry[]) {
        if (entry.type === 'tool_result') {
          const raw = entry.content
          onEvent({ event: 'tool_result', toolCallId: entry.id ?? '', content: typeof raw === 'string' ? raw : JSON.stringify(raw ?? ''), isError: entry.is_error ?? false })
        }
      }
    }
    if (json.type === 'result') {
      const usage = json.usage
      onEvent({
        event: 'done',
        result: json.result,
        totalCostUsd: json.total_cost_usd,
        usage: usage ? {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        } : undefined,
        model: json.model,
      })
    }
  } catch { /* non-JSON lines ignored */ }
}

// ── JSONL file parser (session history) ───────────────────────────────────────

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: unknown
  tool_use_id?: string
  is_error?: boolean
  content?: unknown
}

function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return (raw as ContentBlock[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  return ''
}

export function parseJsonlLine(line: Record<string, unknown>): AgentEvent[] {
  const type = line.type as string

  if (type === 'user') {
    const content = (line.message as { content?: unknown })?.content
    if (typeof content === 'string' && content.trim())
      return [{ event: 'text', role: 'user', text: content }]
    if (Array.isArray(content)) {
      return (content as ContentBlock[])
        .filter((b) => b.type === 'tool_result')
        .map((b) => ({ event: 'tool_result' as const, toolCallId: b.tool_use_id ?? '', content: extractText(b.content), isError: b.is_error ?? false }))
    }
    return []
  }

  if (type === 'assistant') {
    const content = ((line.message as { content?: unknown })?.content ?? []) as ContentBlock[]
    const events: AgentEvent[] = []
    for (const block of content) {
      if (block.type === 'thinking' && block.thinking)
        events.push({ event: 'thinking', thinking: block.thinking })
      if (block.type === 'text' && block.text)
        events.push({ event: 'text', role: 'assistant', text: block.text })
      if (block.type === 'tool_use' && block.name)
        events.push({ event: 'tool_use', toolName: block.name, toolInput: JSON.stringify(block.input ?? {}), toolCallId: block.id ?? '' })
    }
    return events
  }

  if (type === 'system') {
    const sessionId = line.sessionId as string | undefined
    if (sessionId) return [{ event: 'system', model: (line as { model?: string }).model ?? '', sessionId }]
    return []
  }

  if (type === 'result') {
    const usage = line.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined
    return [{
      event: 'done' as const,
      result: line.result as string | undefined,
      totalCostUsd: line.total_cost_usd as number | undefined,
      usage: usage ? {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      } : undefined,
      model: line.model as string | undefined,
    }]
  }

  return []
}

// ── JSONL file reading ────────────────────────────────────────────────────────

export function findSessionFile(sessionId: string): string | null {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  try {
    const result = execSync(
      `find "${claudeDir}" -name "${sessionId}.jsonl" -not -path "*/subagents/*" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim()
    return result || null
  } catch {
    return null
  }
}

export function readEventsFromFile(filePath: string, offset: number): { events: AgentEvent[]; newOffset: number } {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size <= offset) return { events: [], newOffset: offset }
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(stat.size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    fs.closeSync(fd)
    const text = buf.toString('utf8')
    const lastNewline = text.lastIndexOf('\n')
    const complete = lastNewline === -1 ? '' : text.slice(0, lastNewline + 1)
    const events: AgentEvent[] = []
    for (const line of complete.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try { events.push(...parseJsonlLine(JSON.parse(trimmed) as Record<string, unknown>)) } catch { /* skip */ }
    }
    return { events, newOffset: offset + Buffer.byteLength(complete, 'utf8') }
  } catch {
    return { events: [], newOffset: offset }
  }
}
