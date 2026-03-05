import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, XCircle, RotateCcw, Lightbulb, Bug, Sparkles } from 'lucide-react'
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
import type { BacklogItem, BacklogItemType, BacklogItemPriority, BacklogItemStatus } from '@/types/index'

const TYPE_STYLES: Record<BacklogItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}

const TYPE_ICON: Record<BacklogItemType, typeof Lightbulb> = {
  idea: Lightbulb,
  bug: Bug,
  feature: Sparkles,
}

const TYPE_ACCENT: Record<BacklogItemType, string> = {
  idea: 'border-l-blue-500',
  bug: 'border-l-red-500',
  feature: 'border-l-green-500',
}

const PRIORITY_ORDER: Record<BacklogItemPriority, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_DOT: Record<BacklogItemPriority, string> = { high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-muted-foreground/40' }

const COLUMNS: { status: BacklogItemStatus; label: string; dotColor: string }[] = [
  { status: 'todo', label: 'Todo', dotColor: 'bg-muted-foreground' },
  { status: 'in_progress', label: 'In Progress', dotColor: 'bg-primary' },
  { status: 'done', label: 'Done', dotColor: 'bg-green-500' },
  { status: 'closed', label: 'Closed', dotColor: 'bg-muted-foreground/50' },
]

type TypeFilter = BacklogItemType | 'all'

const EMPTY_FORM = { type: 'idea' as BacklogItemType, title: '', description: '', priority: 'medium' as BacklogItemPriority }

// ── Card component for kanban items ──

interface CardProps {
  item: BacklogItem
  onOpen: (item: BacklogItem) => void
  onClose: (item: BacklogItem) => void
  onReopen: (item: BacklogItem) => void
  onDeleteRequest: (item: BacklogItem) => void
}

function BacklogCard({ item, onOpen, onClose, onReopen, onDeleteRequest }: CardProps) {
  const isClosed = item.status === 'closed'
  const isLocked = item.status === 'in_progress' || item.status === 'done'
  const Icon = TYPE_ICON[item.type]
  return (
    <div
      className={`group relative rounded-md border border-border/60 border-l-2 ${TYPE_ACCENT[item.type]} bg-card hover:bg-accent/30 hover:shadow-sm transition-all cursor-pointer ${isClosed ? 'opacity-40' : ''}`}
      onClick={() => onOpen(item)}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Title */}
        <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2 pr-5">{item.title}</p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${TYPE_STYLES[item.type]} px-1.5 py-px rounded-sm text-[10px] font-medium`}>
            <Icon size={9} />
            {item.type}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} title={item.priority} />
          <span className="ml-auto text-[10px] shrink-0">{timeAgo(item.createdAt)}</span>
        </div>
      </div>

      {/* Hover actions — top-right */}
      <div
        className="absolute top-1.5 right-1.5 flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {item.status === 'todo' && (
          <button
            onClick={() => onClose(item)}
            title="Close"
            className="p-1 rounded text-muted-foreground hover:text-yellow-600 hover:bg-yellow-500/10 transition-colors"
          >
            <XCircle size={12} />
          </button>
        )}
        {isClosed && (
          <button
            onClick={() => onReopen(item)}
            title="Reopen"
            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        )}
        {!isLocked && (
          <button
            onClick={() => onDeleteRequest(item)}
            title="Delete"
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function Backlog() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)

  const [items, setItems] = useState<BacklogItem[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BacklogItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    if (!project) return
    window.electronAPI.getBacklogItems(project.id).then(setItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const filtered = items
    .filter((i) => typeFilter === 'all' || i.type === typeFilter)
    .filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      return pd !== 0 ? pd : b.createdAt.localeCompare(a.createdAt)
    })

  // Group filtered items by status
  const byStatus = (status: BacklogItemStatus) => filtered.filter((i) => i.status === status)

  const handleAdd = async () => {
    if (!project || !form.title.trim()) return
    setSubmitting(true)
    const newItem = await window.electronAPI.addBacklogItem(project.id, {
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

  const handleClose = async (item: BacklogItem) => {
    if (!project) return
    const updated = await window.electronAPI.updateBacklogItem(project.id, item.id, { status: 'closed' })
    if (updated) setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  const handleReopen = async (item: BacklogItem) => {
    if (!project) return
    const updated = await window.electronAPI.updateBacklogItem(project.id, item.id, { status: 'todo' })
    if (updated) setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  const handleDelete = async () => {
    if (!project || !deleteTarget) return
    await window.electronAPI.deleteBacklogItem(project.id, deleteTarget.id)
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
      <div className="flex items-center justify-between pt-6 pb-4 shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Backlog</h2>
        <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true) }}>
          <Plus size={12} className="mr-1.5" />
          Add Item
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-3 shrink-0">
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
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium text-foreground">Backlog is empty</p>
            <p className="text-xs text-muted-foreground">Add ideas, bugs, and feature requests here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 h-full">
            {COLUMNS.map(({ status, label, dotColor }) => {
              const columnItems = byStatus(status)
              return (
                <div key={status} className="flex flex-col min-h-0">
                  {/* Column header */}
                  <div className="flex items-center gap-2 py-2 px-1 shrink-0">
                    <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{columnItems.length}</span>
                  </div>

                  {/* Column body */}
                  <div className="flex-1 overflow-y-auto space-y-2 rounded-lg bg-muted/30 p-2">
                    {columnItems.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-6">No items</p>
                    ) : (
                      columnItems.map((item) => (
                        <BacklogCard
                          key={item.id}
                          item={item}
                          onOpen={(i) => navigate(`/projects/${id}/backlog/${i.id}`)}
                          onClose={handleClose}
                          onReopen={handleReopen}
                          onDeleteRequest={setDeleteTarget}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Backlog Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as BacklogItemType }))}
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
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as BacklogItemPriority }))}
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
