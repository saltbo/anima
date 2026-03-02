import { Tray, Menu, app } from 'electron'
import type { BrowserWindow } from 'electron'
import { createTrayIcons, type TrayIconStatus } from './icons'
import type { ProjectService } from '../services/ProjectService'
import type { Project, ProjectStatus } from '../../../src/types/index'

let tray: Tray | null = null
let trayIcons: ReturnType<typeof createTrayIcons> | null = null

function getAggregateStatus(projects: Project[]): TrayIconStatus {
  if (projects.length === 0) return 'sleeping'
  const states = projects.map((p) => p.status)
  if (states.some((s) => s === 'paused')) return 'paused'
  if (states.some((s) => s === 'awake')) return 'awake'
  if (states.some((s) => s === 'checking' || s === 'rate_limited')) return 'checking'
  return 'sleeping'
}

function statusIcon(status: ProjectStatus): string {
  switch (status) {
    case 'sleeping': return '💤'
    case 'checking': return '⟳'
    case 'awake': return '✦'
    case 'paused': return '⚠'
    case 'rate_limited': return '⏱'
    default: return '💤'
  }
}

function statusText(project: Project): string {
  switch (project.status) {
    case 'sleeping':
      return project.nextWakeTime
        ? `Sleeping · next: ${new Date(project.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Sleeping'
    case 'checking': return 'Checking…'
    case 'awake':
      return project.currentIteration
        ? `Working · Round ${project.currentIteration.round}`
        : 'Working'
    case 'paused': return 'Paused'
    case 'rate_limited': return 'Rate Limited'
    default: return 'Sleeping'
  }
}

export function createTray(
  getWindow: () => BrowserWindow | null,
  projectService: ProjectService
): Tray {
  trayIcons = createTrayIcons()
  tray = new Tray(trayIcons.sleeping)
  tray.setToolTip('Anima')

  tray.on('click', () => {
    const win = getWindow()
    if (win) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })

  updateTray(projectService, getWindow)
  return tray
}

export function updateTray(
  projectService: ProjectService,
  getWindow?: () => BrowserWindow | null
): void {
  if (!tray || !trayIcons) return

  const projects = projectService.list()
  const status = getAggregateStatus(projects)
  tray.setImage(trayIcons[status])

  const projectItems = projects.map((project) => ({
    label: `${statusIcon(project.status)}  ${project.name.padEnd(20)}  ${statusText(project)}`,
    click: () => {
      const win = getWindow?.()
      if (win) {
        win.show()
        win.focus()
        win.webContents.send('window:navigate', `/projects/${project.id}`)
      }
    },
  }))

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    { label: 'Anima', enabled: false },
    { type: 'separator' },
    ...(projects.length > 0
      ? projectItems
      : [{ label: 'No projects added yet', enabled: false }]),
    { type: 'separator' },
    {
      label: 'Add Project',
      click: () => {
        const win = getWindow?.()
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('window:addProject')
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open Anima',
      click: () => {
        const win = getWindow?.()
        if (win) { win.show(); win.focus() }
      },
    },
    {
      label: 'Quit',
      click: () => { app.quit() },
    },
  ]

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate))
}
