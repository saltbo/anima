import { TriangleAlert } from 'lucide-react'
import type { MilestoneGitInfo, MilestoneStatus } from '@/types/index'

interface ReviewBannerProps {
  status: MilestoneStatus
  gitInfo: MilestoneGitInfo | null
}

export function ReviewBanner({ status, gitInfo }: ReviewBannerProps) {
  if (status === 'reviewing') {
    return (
      <div className="flex items-center gap-2.5 px-8 py-2.5 bg-yellow-50 border-b border-yellow-200 shrink-0">
        <TriangleAlert size={16} className="text-yellow-600 shrink-0" />
        <span className="text-xs font-medium text-yellow-800">AI review in progress...</span>
      </div>
    )
  }

  if (status === 'awaiting_review') {
    return (
      <div className="flex items-center gap-2.5 px-8 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
        <TriangleAlert size={16} className="text-amber-600 shrink-0" />
        <span className="text-xs font-medium text-amber-800">
          Awaiting human review
          {gitInfo && (
            <> — {gitInfo.commitCount} commit{gitInfo.commitCount !== 1 ? 's' : ''}, {gitInfo.diffStats.filesChanged} file{gitInfo.diffStats.filesChanged !== 1 ? 's' : ''} changed (+{gitInfo.diffStats.insertions} / -{gitInfo.diffStats.deletions})</>
          )}
        </span>
      </div>
    )
  }

  return null
}
