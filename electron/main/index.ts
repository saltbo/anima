import './logger' // must be first — initializes electron-log & IPC transport
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb, closeDb } from './db/index'
import { initSchema } from './db/schema'
import { ProjectRepository } from './repositories/ProjectRepository'
import { BacklogRepository } from './repositories/BacklogRepository'
import { MilestoneRepository } from './repositories/MilestoneRepository'
import { CommentRepository } from './repositories/CommentRepository'
import { ProjectService } from './services/ProjectService'
import { BacklogService } from './services/BacklogService'
import { MilestoneService } from './services/MilestoneService'
import { SoulService } from './services/SoulService'
import { SetupService } from './services/SetupService'
import { GitService } from './services/GitService'
import { AgentRunner } from './agents/AgentRunner'
import { createTray } from './app/tray'
import { setupIPC } from './ipc/index'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let soulService: SoulService | null = null

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
  electronApp.setAppUserModelId('com.bogit.anima')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  const getWindow = (): BrowserWindow | null => mainWindow

  // ── Database ──────────────────────────────────────────────────────────
  const db = getDb()
  initSchema(db)

  // ── Repositories ──────────────────────────────────────────────────────
  const projectRepo = new ProjectRepository(db)
  const backlogRepo = new BacklogRepository(db)
  const milestoneRepo = new MilestoneRepository(db)
  const commentRepo = new CommentRepository(db)

  // ── Services ──────────────────────────────────────────────────────────
  const gitService = new GitService()
  const agentRunner = new AgentRunner()
  const projectService = new ProjectService(projectRepo)
  const backlogService = new BacklogService(backlogRepo)
  const milestoneService = new MilestoneService(
    milestoneRepo, backlogRepo, projectRepo, commentRepo,
    agentRunner, getWindow,
    () => soulService!
  )
  const setupService = new SetupService(agentRunner)
  const mcpServerPath = join(__dirname, 'mcp-server.js')
  const dbPath = join(app.getPath('userData'), 'anima.db')
  soulService = new SoulService(
    projectRepo, milestoneRepo, commentRepo, backlogRepo, gitService, agentRunner, getWindow,
    mcpServerPath, dbPath
  )

  // ── Wire up ───────────────────────────────────────────────────────────
  createTray(getWindow, projectService)
  setupIPC(getWindow, {
    projectService,
    backlogService,
    milestoneService,
    soulService,
    setupService,
    commentRepo,
  })
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
  soulService?.stopAll()
  closeDb()
})

// Keep app running in tray — don't quit when all windows are closed
app.on('window-all-closed', () => {
  // intentionally empty — app lives in system tray
})
