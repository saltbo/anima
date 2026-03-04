import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'

/* ── Delete Dialog ────────────────────────────────────────────────────── */

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onDelete: () => void
}

export function DeleteDialog({ open, onOpenChange, title, onDelete }: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Milestone</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{title}&quot;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onDelete}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Cancel Dialog ────────────────────────────────────────────────────── */

interface CancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isInProgress: boolean
  onCancel: () => void
}

export function CancelDialog({ open, onOpenChange, isInProgress, onCancel }: CancelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Milestone</DialogTitle>
          <DialogDescription>
            {isInProgress
              ? 'This will stop all running agents and cancel the current iteration. The milestone can be re-edited and restarted later.'
              : 'This will remove the milestone from the scheduler queue. You can re-edit and resubmit it later.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Keep Running</Button>
          <Button variant="destructive" onClick={onCancel}>Cancel Milestone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Rollback Dialog ──────────────────────────────────────────────────── */

interface RollbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRollback: () => void
}

export function RollbackDialog({ open, onOpenChange, onRollback }: RollbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rollback Milestone</DialogTitle>
          <DialogDescription>
            This will reset the milestone branch to the base commit, discarding all changes made during iterations. The milestone will be set back to &quot;ready&quot; so it can be re-run.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onRollback}>Rollback</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Request Changes Dialog ───────────────────────────────────────────── */

interface RequestChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function RequestChangesDialog({
  open, onOpenChange, value, onChange, onSubmit,
}: RequestChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Changes</DialogTitle>
          <DialogDescription>
            Describe what needs to be changed. The milestone will be set back to &quot;ready&quot; and the AI will incorporate your feedback in the next iteration.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe the changes needed..."
          className="w-full h-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!value.trim()}>Submit Feedback</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
