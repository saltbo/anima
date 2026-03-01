import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Inbox as InboxIcon, Trash2, Pencil, EyeOff } from 'lucide-react'
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
import type { InboxItem, InboxItemType, InboxItemPriority } from '@/types/index'

const TYPE_STYLES: Record<InboxItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

const PRIORITY_ORDER: Record<InboxItemPriority, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_STYLES: Record<InboxItemPriority, string> = {
  high: 'text-red-500',
  medium: 'text-yellow-500',
  low: 'text-muted-foreground',
}
const PRIORITY_LABELS: Record<InboxItemPriority, string> = {
  high: '↑ High',
  medium: '— Med',
  low: '↓ Low',
}

function TypeBadge({ type }: { type: InboxItemType }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

const EMPTY_FORM = { type: 'idea' as InboxItemType, title: '', description: '', priority: 'medium' as InboxItemPriority }

export function Inbox() {
  const { id } = useParams<{ id: string }>()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [items, setItems] = useState<InboxItem[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<InboxItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  useEffect(() => {
    if (!project) return
    window.electronAPI.getInboxItems(project.path).then(setItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const sortedItems = [...items].sort((a, b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (pd !== 0) return pd
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const activeItems = sortedItems.filter((i) => i.status !== 'dismissed')
  const dismissedItems = sortedItems.filter((i) => i.status === 'dismissed')

  const handleAdd = async () => {
    if (!project || !form.title.trim()) return
    setSubmitting(true)
    const newItem = await window.electronAPI.addInboxItem(project.path, {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
    })
    setItems((prev) => [...prev, newItem])
    setForm(EMPTY_FORM)
    setAddOpen(false)
    setSubmitting(false)
  }

  const handleEditSave = async () => {
    if (!project || !editItem || !form.title.trim()) return
    setSubmitting(true)
    const updated = await window.electronAPI.updateInboxItem(project.path, editItem.id, {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
    })
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    }
    setEditItem(null)
    setForm(EMPTY_FORM)
    setSubmitting(false)
  }

  const openEdit = (item: InboxItem) => {
    setForm({ type: item.type, title: item.title, description: item.description ?? '', priority: item.priority })
    setEditItem(item)
  }

  const handleDismiss = async (item: InboxItem) => {
    if (!project || item.milestoneId) return
    const updated = await window.electronAPI.updateInboxItem(project.path, item.id, { status: 'dismissed' })
    if (updated) setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  const handleDelete = async (item: InboxItem) => {
    if (!project || item.milestoneId) return
    await window.electronAPI.deleteInboxItem(project.path, item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  const ItemCard = ({ item }: { item: InboxItem }) => (
    <div className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-card ${item.status === 'dismissed' ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={item.type} />
          <span className={`text-[10px] font-semibold ${PRIORITY_STYLES[item.priority]}`}>
            {PRIORITY_LABELS[item.priority]}
          </span>
          <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{timeAgo(item.createdAt)}</span>
          {item.status === 'included' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
              Assigned
            </span>
          )}
          {item.status === 'dismissed' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">
              Dismissed
            </span>
          )}
        </div>
      </div>
      {item.status !== 'included' && item.status !== 'dismissed' && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => openEdit(item)}
            title="Edit"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => handleDismiss(item)}
            title="Dismiss"
            className="p-1.5 rounded text-muted-foreground hover:text-yellow-600 hover:bg-yellow-500/10 transition-colors"
          >
            <EyeOff size={13} />
          </button>
          <button
            onClick={() => handleDelete(item)}
            title="Delete"
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )

  const FormContent = () => (
    <div className="space-y-3 py-2">
      <div className="flex gap-2">
        <Select
          value={form.type}
          onValueChange={(v) => setForm((f) => ({ ...f, type: v as InboxItemType }))}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="idea">Idea</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature">Feature</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={form.priority}
          onValueChange={(v) => setForm((f) => ({ ...f, priority: v as InboxItemPriority }))}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">↑ High</SelectItem>
            <SelectItem value="medium">— Medium</SelectItem>
            <SelectItem value="low">↓ Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        placeholder="Title (required)"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <Textarea
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={3}
      />
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
        <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true) }}>
          <Plus size={12} className="mr-1.5" />
          Add Item
        </Button>
      </div>

      {activeItems.length === 0 && dismissedItems.length === 0 ? (
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
          {activeItems.map((item) => <ItemCard key={item.id} item={item} />)}

          {dismissedItems.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowDismissed((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDismissed ? '▾' : '▸'} {dismissedItems.length} dismissed
              </button>
              {showDismissed && (
                <div className="mt-2 space-y-2">
                  {dismissedItems.map((item) => <ItemCard key={item.id} item={item} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inbox Item</DialogTitle>
          </DialogHeader>
          <FormContent />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.title.trim() || submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Inbox Item</DialogTitle>
          </DialogHeader>
          <FormContent />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!form.title.trim() || submitting}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
