import { CircleCheck, Check, RotateCcw } from 'lucide-react'

interface MergeDecisionCardProps {
  completedTaskCount: number
  totalTaskCount: number
  passedACCount: number
  totalACCount: number
  iterationCount: number
  onAcceptMerge: () => void
  onRollback: () => void
}

export function MergeDecisionCard({
  completedTaskCount, totalTaskCount,
  passedACCount, totalACCount,
  iterationCount,
  onAcceptMerge, onRollback,
}: MergeDecisionCardProps) {
  const allTasksDone = completedTaskCount === totalTaskCount && totalTaskCount > 0
  const allACPassed = passedACCount === totalACCount && totalACCount > 0

  return (
    <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-5 py-4">
      {/* Left: status info */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 shrink-0">
          <CircleCheck size={16} className="text-white" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[13px] font-semibold text-green-800">
            {allTasksDone && allACPassed ? 'All checks have passed' : 'Review completed'}
          </p>
          <p className="text-[11px] text-green-900">
            {completedTaskCount}/{totalTaskCount} tasks completed
            {' \u00B7 '}
            {passedACCount}/{totalACCount} acceptance criteria passed
            {' \u00B7 '}
            {iterationCount} iteration{iterationCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAcceptMerge}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-green-600 text-white text-[13px] font-medium hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Check size={14} />
          Accept && Merge
        </button>
        <button
          onClick={onRollback}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-background text-red-600 text-[13px] font-medium border border-border hover:bg-red-50 transition-colors cursor-pointer"
        >
          <RotateCcw size={14} />
          Rollback
        </button>
      </div>
    </div>
  )
}
