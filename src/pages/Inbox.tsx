import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, EyeOff, RefreshCw } from 'lucide-react'
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
  DialogDescription,
} from '@/components/ui/dialog'
import { useProjects } from '@/store/projects'
import { timeAgo } from '@/lib/time'
import type { InboxItem, InboxItemType, InboxItemPriority } from '@/types/index'

const TYPE_STYLES: Record<InboxItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

const PRIORITY_ORDER: Record<InboxItemPriority, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_LABEL: Record<InboxItemPriority, string> = { high: '↑ High', medium: '— Med', low: '↓ Low' }
const PRIORITY_COLOR: Record<InboxItemPriority, string> = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-muted-foreground' }

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', included: 'Included', dismissed: 'Dismissed' }
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  included: 'bg-primary/10 text-primary',
  dismissed: 'bg-muted text-muted-foreground opacity-60',
}

type SortKey = 'priority' | 'date'
type TypeFilter = InboxItemType | 'all'

const EMPTY_FORM = { type: 'idea' as InboxItemType, title: '', description: '', priority: 'medium' as InboxItemPriority }

// ── Row component defined OUTSIDE parent to avoid focus loss on re-render ──

interface RowProps {
  item: InboxItem
  onOpen: (item: InboxItem) => void
  onDismiss: (item: InboxItem) => void
  onRestore: (item: InboxItem) => void
  onDeleteRequest: (item: InboxItem) => void
}

function InboxRow({ item, onOpen, onDismiss, onRestore, onDeleteRequest }: RowProps) {
  const isDismissed = item.status === 'dismissed'
  const isIncluded = item.status === 'included'
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 border-b border-border hover:bg-accent/40 transition-colors ${isDismissed ? 'opacity-50' : ''}`}>
      <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
        {item.type}
      </span>

      <button
        className="flex-1 text-left text-sm text-foreground truncate hover:text-primary transition-colors"
        onClick={() => onOpen(item)}
      >
        {item.title}
      </button>

      <span className={`shrink-0 text-[11px] font-medium ${PRIORITY_COLOR[item.priority]}`}>
        {PRIORITY_LABEL[item.priority]}
      </span>

      <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLE[item.status]}`}>
        {STATUS_LABEL[item.status]}
      </span>

      <span className="shrink-0 text-xs text-muted-foreground w-12 text-right">{timeAgo(item.createdAt)}</span>

      <div className="shrink-0 flex items-center gap-0.5">
        {!isIncluded && !isDismissed && (
          <button
            onClick={() => onDismiss(item)}
            title="Dismiss"
            className="p-1.5 rounded text-muted-foreground hover:text-yellow-600 hover:bg-yellow-500/10 transition-colors"
          >
            <EyeOff size={13} />
          </button>
        )}
        {isDismissed && (
          <button
            onClick={() => onRestore(item)}
            title="Restore"
            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        )}
        {!isIncluded && (
          <button
            onClick={() => onDeleteRequest(item)}
            title="Delete"
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function Inbox() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [items, setItems] = useState<InboxItem[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InboxItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('priority')

  useEffect(() => {
    if (!project) return
    window.electronAPI.getInboxItems(project.id).then(setItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const filtered = items
    .filter((i) => typeFilter === 'all' || i.type === typeFilter)
    .filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        return pd !== 0 ? pd : b.createdAt.localeCompare(a.createdAt)
      }
      return b.createdAt.localeCompare(a.createdAt)
    })

  const handleAdd = async () => {
    if (!project || !form.title.trim()) return
    setSubmitting(true)
    const newItem = await window.electronAPI.addInboxItem(project.id, {
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

  const handleDismiss = async (item: InboxItem) => {
    if (!project) return
    const updated = await window.electronAPI.updateInboxItem(project.id, item.id, { status: 'dismissed' })
    if (updated) setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  const handleRestore = async (item: InboxItem) => {
    if (!project) return
    const updated = await window.electronAPI.updateInboxItem(project.id, item.id, { status: 'pending' })
    if (updated) setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  const handleDelete = async () => {
    if (!project || !deleteTarget) return
    await window.electronAPI.deleteInboxItem(project.id, deleteTarget.id)
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'idea', label: 'Idea' },
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
        <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true) }}>
          <Plus size={12} className="mr-1.5" />
          Add Item
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>

        <div className="flex items-center gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Sort: Priority</SelectItem>
            <SelectItem value="date">Sort: Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {/* Column header */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="w-14">Type</span>
            <span className="flex-1">Title</span>
            <span className="w-12 text-right">Priority</span>
            <span className="w-16 text-right">Status</span>
            <span className="w-12 text-right">Date</span>
            <span className="w-16" />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {items.length === 0 ? 'Inbox is empty' : 'No items match your filter'}
            </p>
            <p className="text-xs text-muted-foreground">
              {items.length === 0 ? 'Add ideas, bugs, and feature requests here.' : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              onOpen={(i) => navigate(`/projects/${id}/inbox/${i.id}`)}
              onDismiss={handleDismiss}
              onRestore={handleRestore}
              onDeleteRequest={setDeleteTarget}
            />
          ))
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inbox Item</DialogTitle>
          </DialogHeader>
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
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.title.trim() || submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
