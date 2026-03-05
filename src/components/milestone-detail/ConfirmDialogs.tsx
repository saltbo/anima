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
