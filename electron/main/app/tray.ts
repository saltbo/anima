import { Tray, Menu, app } from 'electron'
import type { BrowserWindow } from 'electron'
import { createTrayIcons, type TrayIconStatus } from './icons'
import { getProjectState } from '../data/state'
import type { Project, ProjectStatus } from '../../../src/types/index'

let tray: Tray | null = null
let trayIcons: ReturnType<typeof createTrayIcons> | null = null

function getAggregateStatus(projects: Project[]): TrayIconStatus {
  if (projects.length === 0) return 'sleeping'
  const states = projects.map((p) => getProjectState(p.path).status)
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
  const state = getProjectState(project.path)
  switch (state.status) {
    case 'sleeping':
      return state.nextWakeTime
        ? `Sleeping · next: ${new Date(state.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Sleeping'
    case 'checking': return 'Checking…'
    case 'awake':
      return state.currentIteration
        ? `Working · Iteration ${state.currentIteration.count}`
        : 'Working'
    case 'paused': return 'Paused'
    case 'rate_limited': return 'Rate Limited'
    default: return 'Sleeping'
  }
}

export function createTray(
  getWindow: () => BrowserWindow | null,
  getProjects: () => Project[]
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

  updateTray(getProjects(), getWindow)
  return tray
}

export function updateTray(
  projects: Project[],
  getWindow?: () => BrowserWindow | null
): void {
  if (!tray || !trayIcons) return

  const status = getAggregateStatus(projects)
  tray.setImage(trayIcons[status])

  const projectItems = projects.map((project) => {
    const state = getProjectState(project.path)
    return {
      label: `${statusIcon(state.status)}  ${project.name.padEnd(20)}  ${statusText(project)}`,
      click: () => {
        const win = getWindow?.()
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('window:navigate', `/projects/${project.id}`)
        }
      },
    }
  })

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
