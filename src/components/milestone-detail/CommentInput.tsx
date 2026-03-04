import { Button } from '@/components/ui/button'
import { CircleX } from 'lucide-react'

interface CommentInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  canClose?: boolean
  onClose?: () => void
}

export function CommentInput({ value, onChange, onSubmit, disabled, canClose, onClose }: CommentInputProps) {
  const hasText = value.trim().length > 0

  return (
    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leave a comment..."
        className="w-full resize-none border-0 bg-transparent px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[64px]"
        rows={3}
      />
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-border">
        <span className="text-[11px] text-muted-foreground">Markdown supported</span>
        <div className="flex items-center gap-2">
          {canClose && onClose && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              onClick={onClose}
              disabled={disabled}
            >
              <CircleX size={13} className="text-red-500" />
              {hasText ? 'Close with comment' : 'Close milestone'}
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs cursor-pointer"
            onClick={onSubmit}
            disabled={disabled || !hasText}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}
