import './logger' // must be first — initializes electron-log & IPC transport
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

if (is.dev) {
  app.setName('Anima-Dev')
}
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { getDb, closeDb } from './db/index'
import { initSchema } from './db/schema'
import { ProjectRepository } from './repositories/ProjectRepository'
import { BacklogRepository } from './repositories/BacklogRepository'
import { MilestoneRepository } from './repositories/MilestoneRepository'
import { CommentRepository } from './repositories/CommentRepository'
import { CheckRepository } from './repositories/CheckRepository'
import { MilestoneItemRepository } from './repositories/MilestoneItemRepository'
import { SessionRepository } from './repositories/SessionRepository'
import { ActionRepository } from './repositories/ActionRepository'
import { ProjectService } from './services/ProjectService'
import { BacklogService } from './services/BacklogService'
import { MilestoneService } from './services/MilestoneService'
import { SoulService } from './services/SoulService'
import { SetupService } from './services/SetupService'
import { GitService } from './services/GitService'
import { AgentRunner } from './agents/AgentRunner'
import { SessionWatcher } from './agents/SessionWatcher'
import { createTray } from './app/tray'
import { createRoutes } from './api/routes'
import { registerIpcAdapter } from './api/ipcAdapter'
import { startSocketServer } from './api/socketAdapter'
import { initMcpConfig, ensureMcpConfigFile } from './mcp/mcpConfig'

const appIcon = is.dev
  ? join(__dirname, '../../resources/icon.png')
  : join(process.resourcesPath, 'icon.png')

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let soulService: SoulService | null = null
let sessionWatcher: SessionWatcher | null = null

// ── Auto Updater ────────────────────────────────────────────────────────────

function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, data?: unknown) => {
    getWindow()?.webContents.send(channel, data)
  }

  autoUpdater.on('checking-for-update', () => {
    send('updater:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send('updater:status', { status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:status', { status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send('updater:status', { status: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:status', { status: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
    send('updater:status', { status: 'error', error: err.message })
  })

  ipcMain.handle('updater:check', async () => {
    const result = await autoUpdater.checkForUpdates()
    return result?.updateInfo?.version ?? null
  })

  ipcMain.handle('updater:download', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('cc.tftt.anima')

  // Set dock icon for dev mode (macOS)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIcon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  const getWindow = (): BrowserWindow | null => mainWindow

  // ── Database ──────────────────────────────────────────────────────────
  const db = getDb()
  initSchema(db)

  // ── MCP Config ──────────────────────────────────────────────────────
  const mcpServerPath = app.isPackaged
    ? join(process.resourcesPath, 'mcp-server.js')
    : join(__dirname, 'mcp-server.js')
  const bridgeSocketPath = join(app.getPath('userData'), 'anima-bridge.sock')
  initMcpConfig(app.getPath('userData'), mcpServerPath, bridgeSocketPath)
  ensureMcpConfigFile()

  // ── Repositories ──────────────────────────────────────────────────────
  const projectRepo = new ProjectRepository(db)
  const backlogRepo = new BacklogRepository(db)
  const milestoneRepo = new MilestoneRepository(db)
  const commentRepo = new CommentRepository(db)
  const checkRepo = new CheckRepository(db)
  const milestoneItemRepo = new MilestoneItemRepository(db)
  const sessionRepo = new SessionRepository(db)
  const actionRepo = new ActionRepository(db)

  // ── Services ──────────────────────────────────────────────────────────
  const gitService = new GitService()
  const agentRunner = new AgentRunner()
  const projectService = new ProjectService(projectRepo)
  const backlogService = new BacklogService(backlogRepo)
  const milestoneService = new MilestoneService(
    milestoneRepo, backlogRepo, milestoneItemRepo, projectRepo, commentRepo, checkRepo, actionRepo,
    getWindow,
    () => soulService!
  )
  const setupService = new SetupService(agentRunner)
  sessionWatcher = new SessionWatcher(getWindow)
  soulService = new SoulService(
    projectRepo, milestoneRepo, sessionRepo, commentRepo, backlogRepo, milestoneItemRepo, actionRepo, gitService, agentRunner, getWindow
  )

  // ── Wire up ───────────────────────────────────────────────────────────
  createTray(getWindow, projectService)

  const routes = createRoutes({
    projectService,
    backlogService,
    milestoneService,
    milestoneRepo,
    soulService,
    setupService,
    commentRepo,
    checkRepo,
    actionRepo,
    sessionWatcher,
  }, getWindow)
  registerIpcAdapter(routes)
  startSocketServer(routes, bridgeSocketPath)

  // ── Auto Updater ─────────────────────────────────────────────────────
  setupAutoUpdater(getWindow)
  if (!is.dev) {
    autoUpdater.checkForUpdates().catch((err) => log.warn('Update check failed:', err))
  }

  soulService.startAll()

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  sessionWatcher?.dispose()
  soulService?.stopAll()
  closeDb()
})

// Keep app running in tray — don't quit when all windows are closed
app.on('window-all-closed', () => {
  // intentionally empty — app lives in system tray
})
