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
    sendSetupMessage: async () => {},
    stopSetupSession: async () => {},
    writeSetupFile: async () => {},

    onProjectsUpdated: () => () => {},
    onNavigate: () => () => {},
    onTriggerAddProject: () => () => {},
    onSetupChatData: () => () => {},
  }
}
