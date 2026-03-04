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

    checkProjectSetup: async () => ({ hasSoul: false }),
    readSetupFiles: async () => ({ soul: null }),
    startSetupAgent: async () => {},
    listSoulTemplates: async () => [],
    applySoulTemplate: async () => {},
    startSoulAgent: async () => {},
    writeSetupFile: async () => {},

    readSessionEvents: async () => [],
    sendAgentMessage: async () => {},
    stopAgent: async () => {},

    onProjectsUpdated: () => () => {},
    onNavigate: () => () => {},
    onTriggerAddProject: () => () => {},

    getBacklogItems: async () => [],
    addBacklogItem: async () => ({ id: '', title: '', type: 'idea', priority: 'medium', status: 'todo', createdAt: '' }),
    updateBacklogItem: async () => null,
    deleteBacklogItem: async () => {},
    getMilestones: async () => [],
    saveMilestone: async () => {},
    deleteMilestone: async () => {},
    updateMilestoneTask: async () => {},
    writeMilestoneMarkdown: async () => {},
    readMilestoneMarkdown: async () => null,
    startMilestonePlanning: async () => ({ sessionId: '', milestoneId: '' }),

    onMilestonePlanningDone: () => () => {},
    onMilestoneReviewDone: () => () => {},

    wakeProject: async () => {},
    updateWakeSchedule: async () => {},
    transitionMilestone: async () => {},

    onProjectStatusChanged: () => () => {},
    onProjectAgentEvent: () => () => {},
    onMilestoneUpdated: () => () => {},
    onMilestoneCompleted: () => () => {},
    onIterationPaused: () => () => {},
    onRateLimited: () => () => {},
  }
}
