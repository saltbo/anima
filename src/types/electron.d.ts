import type { Project } from './index'

export type SetupChatData =
  | { event: 'text'; text: string }
  | { event: 'thinking'; thinking: string }
  | { event: 'tool_use'; toolName: string; toolInput: string; toolCallId: string }
  | { event: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { event: 'system'; model: string; sessionId: string }
  | { event: 'rate_limit'; utilization: number }
  | { event: 'done'; result?: string }
  | { event: 'error'; message: string }

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<Project[]>
      addProject: () => Promise<Project | null>
      removeProject: (id: string) => Promise<boolean>
      navigateTo: (path: string) => Promise<void>

      checkProjectSetup: (projectPath: string) => Promise<{ hasVision: boolean; hasSoul: boolean }>
      readSetupFiles: (projectPath: string) => Promise<{ vision: string | null; soul: string | null }>
      startSetupSession: (id: string, projectPath: string, type: 'vision' | 'soul' | 'init') => Promise<void>
      sendSetupMessage: (id: string, message: string) => Promise<void>
      stopSetupSession: (id: string) => Promise<void>
      writeSetupFile: (projectPath: string, type: 'vision' | 'soul', content: string) => Promise<void>

      onProjectsUpdated: (callback: (projects: Project[]) => void) => () => void
      onNavigate: (callback: (path: string) => void) => () => void
      onTriggerAddProject: (callback: () => void) => () => void
      onSetupChatData: (callback: (id: string, data: SetupChatData) => void) => () => void
    }
  }
}
