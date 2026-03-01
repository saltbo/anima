import { useParams } from 'react-router-dom'
import { Plus, Inbox as InboxIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Inbox() {
  useParams<{ id: string }>()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
        <Button size="sm">
          <Plus size={12} className="mr-1.5" />
          Add Item
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
          <InboxIcon size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Inbox is empty</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Drop ideas, bugs, and feature requests here. They&apos;ll be picked up during milestone
            planning.
          </p>
        </div>
      </div>
    </div>
  )
}
