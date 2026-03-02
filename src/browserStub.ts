// Browser stub: provides the same API shape as the Electron preload API,
// but with empty / no-op behavior. Used when running in a plain browser
// (i.e. the Electron preload has not injected window.electronAPI).
// This lets the UI open in a browser for development without fake data.

export function installBrowserStub() {
  if (window.electronAPI) return

  window.electronAPI = {
    getProjects: async () => [],
    addProject: async () => null,
    removeProject: async () => true,
    navigateTo: async () => {},

    checkProjectSetup: async () => ({ hasVision: false, hasSoul: false }),
    readSetupFiles: async () => ({ vision: null, soul: null }),
    startSetupSession: async () => {},
    sendAgentMessage: async () => {},
    stopAgentSession: async () => {},
    writeSetupFile: async () => {},

    readSession: async () => [],

    onProjectsUpdated: () => () => {},
    onNavigate: () => () => {},
    onTriggerAddProject: () => () => {},
    onSessionUpdated: () => () => {},

    getInboxItems: async () => [],
    addInboxItem: async () => ({ id: '', title: '', type: 'idea', priority: 'medium', status: 'pending', createdAt: '' }),
    updateInboxItem: async () => null,
    deleteInboxItem: async () => {},
    getMilestones: async () => [],
    saveMilestone: async () => {},
    deleteMilestone: async () => {},
    updateMilestoneTask: async () => {},
    writeMilestoneMarkdown: async () => {},
    readMilestoneMarkdown: async () => null,
    startMilestonePlanningSession: async () => {},

    onMilestonePlanningDone: () => () => {},
    onMilestoneReviewDone: () => () => {},

    getProjectState: async () => ({ status: 'sleeping', currentIteration: null, rateLimitResetAt: null, nextWakeTime: null, totalTokens: 0, totalCost: 0, wakeSchedule: { mode: 'manual', intervalMinutes: null, times: [] } }),
    wakeProject: async () => {},
    updateWakeSchedule: async () => {},

    onProjectStatusChanged: () => () => {},
    onIterationAgentEvent: () => () => {},
    onMilestoneUpdated: () => () => {},
    onMilestoneCompleted: () => () => {},
    onIterationPaused: () => () => {},
    onRateLimited: () => () => {},
  }
}
