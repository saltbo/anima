import { OctagonX } from 'lucide-react'

interface CancelCardProps {
  onCancel: () => void
}

export function CancelCard({ onCancel }: CancelCardProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-red-200 bg-red-50">
      <div className="flex items-center gap-2.5">
        <OctagonX size={16} className="text-red-600 shrink-0" />
        <span className="text-xs font-medium text-red-800">
          Stop execution and cancel this milestone?
        </span>
      </div>
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer shrink-0"
      >
        Cancel Milestone
      </button>
    </div>
  )
}
