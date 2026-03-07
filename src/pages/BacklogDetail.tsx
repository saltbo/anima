import { useState } from 'react'
import { useParams, useNavigate, useLoaderData } from 'react-router-dom'
import { XCircle, RotateCcw, Trash2, Pencil, X, Check } from 'lucide-react'
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
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useProjects } from '@/store/projects'
import { timeAgo } from '@/lib/time'
import type { BacklogItem, BacklogItemType, BacklogItemPriority } from '@/types/index'
import type { BacklogDetailLoaderData } from '@/types/router'
import type { LoaderFunctionArgs } from 'react-router-dom'

export const backlogDetailLoader = async ({ params }: LoaderFunctionArgs) => {
  const { id, itemId } = params
  const items = await window.electronAPI.getBacklogItems(id!)
  const item = items.find((i) => i.id === itemId) ?? null
  return { meta: { title: item?.title ?? '' }, item } satisfies BacklogDetailLoaderData
}

const TYPE_STYLES: Record<BacklogItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}
const PRIORITY_LABEL: Record<BacklogItemPriority, string> = { high: '↑ High', medium: '— Medium', low: '↓ Low' }
const PRIORITY_COLOR: Record<BacklogItemPriority, string> = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-muted-foreground' }

export function BacklogDetail() {
  const { id } = useParams<{ id: string; itemId: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)
  const { item: initial } = useLoaderData() as BacklogDetailLoaderData

  const [item, setItem] = useState<BacklogItem | null>(initial)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(() => ({
    type: (initial?.type ?? 'idea') as BacklogItemType,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: (initial?.priority ?? 'medium') as BacklogItemPriority,
  }))
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const startEdit = () => {
    if (!item) return
    setEditForm({ type: item.type, title: item.title, description: item.description ?? '', priority: item.priority })
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!project || !item || !editForm.title.trim()) return
    setSaving(true)
    const updated = await window.electronAPI.updateBacklogItem(project.id, item.id, {
      type: editForm.type,
      title: editForm.title.trim(),
      description: editForm.description.trim() || undefined,
      priority: editForm.priority,
    })
    if (updated) setItem(updated)
    setEditing(false)
    setSaving(false)
  }

  const handleClose = async () => {
    if (!project || !item) return
    const updated = await window.electronAPI.updateBacklogItem(project.id, item.id, { status: 'closed' })
    if (updated) setItem(updated)
  }

  const handleReopen = async () => {
    if (!project || !item) return
    const updated = await window.electronAPI.updateBacklogItem(project.id, item.id, { status: 'todo' })
    if (updated) setItem(updated)
  }

  const handleDelete = async () => {
    if (!project || !item) return
    await window.electronAPI.deleteBacklogItem(project.id, item.id)
    navigate(`/projects/${id}/backlog`)
  }

  if (!item) {
    return <div className="py-6 text-sm text-muted-foreground">Item not found.</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pt-6 pb-4 shrink-0">
        <div className="flex-1" />
        {!editing && (item.status === 'todo' || item.status === 'closed') && (
          <div className="flex items-center gap-1">
            {item.status === 'todo' && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={startEdit}>
                <Pencil size={12} />
                Edit
              </Button>
            )}
            {item.status === 'closed' ? (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReopen}>
                <RotateCcw size={12} />
                Reopen
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-yellow-600 hover:text-yellow-700" onClick={handleClose}>
                <XCircle size={12} />
                Close
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={12} />
              Delete
            </Button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-1">
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSaveEdit} disabled={!editForm.title.trim() || saving}>
              <Check size={12} />
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setEditing(false)}>
              <X size={12} />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto py-6 space-y-5">
        {/* Badges */}
        {!editing && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
              {item.type}
            </span>
            <span className={`text-xs font-semibold ${PRIORITY_COLOR[item.priority]}`}>
              {PRIORITY_LABEL[item.priority]}
            </span>
            {item.status === 'in_progress' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                In Progress
              </span>
            )}
            {item.status === 'done' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-500/10 text-green-600 text-xs font-medium">
                Done
              </span>
            )}
            {item.status === 'closed' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs font-medium">
                Closed
              </span>
            )}
          </div>
        )}

        {editing ? (
          /* Edit form */
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={editForm.type} onValueChange={(v) => setEditForm((f) => ({ ...f, type: v as BacklogItemType }))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                </SelectContent>
              </Select>
              <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v as BacklogItemPriority }))}>
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
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Textarea
              placeholder="Description (optional)"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              rows={6}
            />
          </div>
        ) : (
          /* View mode */
          <>
            <h2 className="text-base font-semibold text-foreground">{item.title}</h2>
            {item.description ? (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Description</p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                  <Markdown remarkPlugins={[remarkGfm]}>{item.description}</Markdown>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description.</p>
            )}
            <p className="text-xs text-muted-foreground">Created {timeAgo(item.createdAt)}</p>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{item.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
