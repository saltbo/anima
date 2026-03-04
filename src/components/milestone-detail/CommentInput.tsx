import { Button } from '@/components/ui/button'

interface CommentInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}

export function CommentInput({ value, onChange, onSubmit, disabled }: CommentInputProps) {
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
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs cursor-pointer"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          Comment
        </Button>
      </div>
    </div>
  )
}
