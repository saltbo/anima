import { useParams } from 'react-router-dom'
import { Plus, Inbox as InboxIcon } from 'lucide-react'

export function Inbox() {
  useParams<{ id: string }>()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app-text-primary">Inbox</h2>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-accent/10 hover:bg-app-accent/20 text-app-accent text-xs font-medium transition-colors">
          <Plus size={12} />
          Add Item
        </button>
      </div>

      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-app-surface border border-app-border flex items-center justify-center">
          <InboxIcon size={20} className="text-app-text-secondary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-app-text-primary">Inbox is empty</h3>
          <p className="text-sm text-app-text-secondary mt-1">
            Drop ideas, bugs, and feature requests here. They&apos;ll be picked up during milestone
            planning.
          </p>
        </div>
      </div>
    </div>
  )
}
