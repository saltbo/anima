import { Tray, Menu, app } from 'electron'
import type { BrowserWindow } from 'electron'
import { createTrayIcons, type TrayIconStatus } from './icons'
import type { ProjectService } from '../services/ProjectService'
import type { ProjectView, ProjectStatus } from '../../../src/types/index'

let tray: Tray | null = null
let trayIcons: ReturnType<typeof createTrayIcons> | null = null

function getAggregateStatus(views: ProjectView[]): TrayIconStatus {
  if (views.length === 0) return 'sleeping'
  const states = views.map((v) => v.status)
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

function statusText(view: ProjectView): string {
  switch (view.status) {
    case 'sleeping':
      return view.nextWakeTime
        ? `Sleeping · next: ${new Date(view.nextWakeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Sleeping'
    case 'checking': return 'Checking…'
    case 'awake':
      return view.currentIteration
        ? `Working · Round ${view.currentIteration.round}`
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

  const views = projectService.listWithState()
  const status = getAggregateStatus(views)
  tray.setImage(trayIcons[status])

  const projectItems = views.map((view) => ({
    label: `${statusIcon(view.status)}  ${view.name.padEnd(20)}  ${statusText(view)}`,
    click: () => {
      const win = getWindow?.()
      if (win) {
        win.show()
        win.focus()
        win.webContents.send('window:navigate', `/projects/${view.id}`)
      }
    },
  }))

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    { label: 'Anima', enabled: false },
    { type: 'separator' },
    ...(views.length > 0
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
