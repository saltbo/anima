import { createHashRouter, RouterProvider } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { GlobalDashboard } from '@/pages/GlobalDashboard'
import { ProjectDashboard } from '@/pages/ProjectDashboard'
import { Milestones } from '@/pages/Milestones'
import { MilestoneDetail, milestoneDetailLoader } from '@/pages/MilestoneDetail'
import { MilestoneNew } from '@/pages/MilestoneNew'
import { Backlog } from '@/pages/Backlog'
import { BacklogDetail, backlogDetailLoader } from '@/pages/BacklogDetail'
import { ProjectSettings } from '@/pages/ProjectSettings'
import { Soul } from '@/pages/Soul'
import { GlobalSettings } from '@/pages/GlobalSettings'
import type { RouteHandle } from '@/types/router'

const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <GlobalDashboard /> },
      { path: 'settings', element: <GlobalSettings /> },
      {
        path: 'projects/:id',
        element: <ProjectDashboard />,
        handle: { crumb: [{ label: 'Dashboard' }] } satisfies RouteHandle,
      },
      {
        path: 'projects/:id/soul',
        element: <Soul />,
        handle: { crumb: [{ label: 'Soul' }] } satisfies RouteHandle,
      },
      {
        path: 'projects/:id/milestones',
        element: <Milestones />,
        handle: { crumb: [{ label: 'Milestones' }] } satisfies RouteHandle,
      },
      {
        path: 'projects/:id/milestones/new',
        element: <MilestoneNew />,
        handle: {
          crumb: [
            { label: 'Milestones', path: 'milestones' },
            { label: 'New' },
          ],
        } satisfies RouteHandle,
      },
      {
        path: 'projects/:id/milestones/:mid',
        element: <MilestoneDetail />,
        handle: {
          crumb: [{ label: 'Milestones', path: 'milestones' }],
        } satisfies RouteHandle,
        loader: milestoneDetailLoader,
      },
      {
        path: 'projects/:id/backlog',
        element: <Backlog />,
        handle: { crumb: [{ label: 'Backlog' }] } satisfies RouteHandle,
      },
      {
        path: 'projects/:id/backlog/:itemId',
        element: <BacklogDetail />,
        handle: {
          crumb: [{ label: 'Backlog', path: 'backlog' }],
        } satisfies RouteHandle,
        loader: backlogDetailLoader,
      },
      {
        path: 'projects/:id/settings',
        element: <ProjectSettings />,
        handle: { crumb: [{ label: 'Settings' }] } satisfies RouteHandle,
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
