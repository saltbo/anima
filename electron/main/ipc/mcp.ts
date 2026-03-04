import type { ServiceContext } from './index'
import { safeHandle } from './safeHandle'
import {
  getUserMcpServers,
  addUserMcpServer,
  updateUserMcpServer,
  removeUserMcpServer,
  type McpServerEntry,
} from '../mcp/mcpConfig'

export function registerMcpIPC(_ctx: ServiceContext): void {
  safeHandle('mcp:list', () => {
    return getUserMcpServers()
  })

  safeHandle('mcp:add', (_event, name: string, entry: McpServerEntry) => {
    addUserMcpServer(name, entry)
  })

  safeHandle('mcp:update', (_event, name: string, entry: McpServerEntry) => {
    updateUserMcpServer(name, entry)
  })

  safeHandle('mcp:remove', (_event, name: string) => {
    removeUserMcpServer(name)
  })
}
