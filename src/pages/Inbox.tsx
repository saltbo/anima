import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Inbox as InboxIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useProjects } from '@/store/projects'
import type { InboxItem, InboxItemType } from '@/types/index'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

const TYPE_STYLES: Record<InboxItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

function TypeBadge({ type }: { type: InboxItemType }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  )
}

export function Inbox() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [items, setItems] = useState<InboxItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<{ type: InboxItemType; title: string; description: string }>({
    type: 'idea',
    title: '',
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!project) return
    window.electronAPI.getInboxItems(project.path).then(setItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const handleAdd = async () => {
    if (!project || !form.title.trim()) return
    setSubmitting(true)
    const newItem = await window.electronAPI.addInboxItem(project.path, {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
    })
    setItems((prev) => [...prev, newItem])
    setForm({ type: 'idea', title: '', description: '' })
    setDialogOpen(false)
    setSubmitting(false)
  }

  const handleDelete = async (item: InboxItem) => {
    if (!project || item.milestoneId) return
    await window.electronAPI.deleteInboxItem(project.path, item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={12} className="mr-1.5" />
          Add Item
        </Button>
      </div>

      {items.length === 0 ? (
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
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <TypeBadge type={item.type} />
                  <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{timeAgo(item.createdAt)}</span>
                  {item.milestoneId && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                      Assigned
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item)}
                disabled={!!item.milestoneId}
                title={item.milestoneId ? 'Assigned to a milestone' : 'Delete'}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inbox Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as InboxItemType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Title (required)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!form.title.trim() || submitting}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
