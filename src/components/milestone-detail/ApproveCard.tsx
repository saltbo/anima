import { CheckCircle } from 'lucide-react'

interface ApproveCardProps {
  onApprove: () => void
}

export function ApproveCard({ onApprove }: ApproveCardProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-blue-200 bg-blue-50">
      <div className="flex items-center gap-2.5">
        <CheckCircle size={16} className="text-blue-600 shrink-0" />
        <span className="text-xs font-medium text-blue-800">
          Plan reviewed — approve to start execution?
        </span>
      </div>
      <button
        onClick={onApprove}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
      >
        Approve
      </button>
    </div>
  )
}
