import { Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { GlobalDashboard } from '@/pages/GlobalDashboard'
import { ProjectDashboard } from '@/pages/ProjectDashboard'
import { Milestones } from '@/pages/Milestones'
import { MilestoneDetail } from '@/pages/MilestoneDetail'
import { MilestoneNew } from '@/pages/MilestoneNew'
import { Inbox } from '@/pages/Inbox'
import { InboxDetail } from '@/pages/InboxDetail'
import { ProjectSettings } from '@/pages/ProjectSettings'
import { SoulVision } from '@/pages/SoulVision'
import { GlobalSettings } from '@/pages/GlobalSettings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<GlobalDashboard />} />
        <Route path="settings" element={<GlobalSettings />} />
        <Route path="projects/:id" element={<ProjectDashboard />} />
        <Route path="projects/:id/soul-vision" element={<SoulVision />} />
        <Route path="projects/:id/milestones" element={<Milestones />} />
        <Route path="projects/:id/milestones/new" element={<MilestoneNew />} />
        <Route path="projects/:id/milestones/:mid" element={<MilestoneDetail />} />
        <Route path="projects/:id/inbox" element={<Inbox />} />
        <Route path="projects/:id/inbox/:itemId" element={<InboxDetail />} />
        <Route path="projects/:id/settings" element={<ProjectSettings />} />
      </Route>
    </Routes>
  )
}
