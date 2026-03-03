import { useState } from 'react'
import { useParams, useNavigate, useLoaderData } from 'react-router-dom'
import { EyeOff, RefreshCw, Trash2, Pencil, X, Check } from 'lucide-react'
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
import type { InboxDetailLoaderData } from '@/types/router'
import type { LoaderFunctionArgs } from 'react-router-dom'

export const inboxDetailLoader = async ({ params }: LoaderFunctionArgs) => {
  const { id, itemId } = params
  const items = await window.electronAPI.getInboxItems(id!)
  const item = items.find((i) => i.id === itemId) ?? null
  return { meta: { title: item?.title ?? '' }, item } satisfies InboxDetailLoaderData
}

const TYPE_STYLES: Record<InboxItemType, string> = {
  idea: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  bug: 'bg-red-500/10 text-red-600 border border-red-500/30',
  feature: 'bg-green-500/10 text-green-600 border border-green-500/30',
}
const PRIORITY_LABEL: Record<InboxItemPriority, string> = { high: '↑ High', medium: '— Medium', low: '↓ Low' }
const PRIORITY_COLOR: Record<InboxItemPriority, string> = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-muted-foreground' }

export function InboxDetail() {
  const { id } = useParams<{ id: string; itemId: string }>()
  const navigate = useNavigate()
  const { projects } = useProjects()
  const project = projects.find((p) => p.id === id)
  const { item: initial } = useLoaderData() as InboxDetailLoaderData

  const [item, setItem] = useState<InboxItem | null>(initial)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(() => ({
    type: (initial?.type ?? 'idea') as InboxItemType,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: (initial?.priority ?? 'medium') as InboxItemPriority,
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
    const updated = await window.electronAPI.updateInboxItem(project.id, item.id, {
      type: editForm.type,
      title: editForm.title.trim(),
      description: editForm.description.trim() || undefined,
      priority: editForm.priority,
    })
    if (updated) setItem(updated)
    setEditing(false)
    setSaving(false)
  }

  const handleDismiss = async () => {
    if (!project || !item) return
    const updated = await window.electronAPI.updateInboxItem(project.id, item.id, { status: 'dismissed' })
    if (updated) setItem(updated)
  }

  const handleRestore = async () => {
    if (!project || !item) return
    const updated = await window.electronAPI.updateInboxItem(project.id, item.id, { status: 'pending' })
    if (updated) setItem(updated)
  }

  const handleDelete = async () => {
    if (!project || !item) return
    await window.electronAPI.deleteInboxItem(project.id, item.id)
    navigate(`/projects/${id}/inbox`)
  }

  if (!item) {
    return <div className="py-6 text-sm text-muted-foreground">Item not found.</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pt-6 pb-4 shrink-0">
        <div className="flex-1" />
        {!editing && item.status !== 'included' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={startEdit}>
              <Pencil size={12} />
              Edit
            </Button>
            {item.status === 'dismissed' ? (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleRestore}>
                <RefreshCw size={12} />
                Restore
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-yellow-600 hover:text-yellow-700" onClick={handleDismiss}>
                <EyeOff size={12} />
                Dismiss
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
            {item.status === 'included' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                Included in a milestone
              </span>
            )}
            {item.status === 'dismissed' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs font-medium">
                Dismissed
              </span>
            )}
          </div>
        )}

        {editing ? (
          /* Edit form */
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={editForm.type} onValueChange={(v) => setEditForm((f) => ({ ...f, type: v as InboxItemType }))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                </SelectContent>
              </Select>
              <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v as InboxItemPriority }))}>
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
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{item.description}</p>
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
