import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { formatTokens, formatElapsed } from '@/lib/time'
import { AgentChat } from '@/components/AgentChat'
import type { AgentSession } from '@/types/index'

export interface SessionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: AgentSession | null
}

const AGENT_LABELS: Record<string, string> = {
  developer: 'Developer',
  reviewer: 'Reviewer',
  planner: 'Planner',
}

export function SessionDrawer({ open, onOpenChange, session }: SessionDrawerProps) {
  if (!session) return null

  const label = AGENT_LABELS[session.agentId] ?? session.agentId

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />

        {/* Drawer panel */}
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-border bg-background shadow-2xl data-[state=open]:animate-slide-in-from-right data-[state=closed]:animate-slide-out-to-right focus:outline-none"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground truncate">
                {label} Session
              </DialogPrimitive.Title>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{formatElapsed(session.startedAt, session.completedAt)}</span>
                {session.totalTokens > 0 && <span>{formatTokens(session.totalTokens)} tokens</span>}
                {session.totalCost > 0 && <span>${session.totalCost.toFixed(2)}</span>}
              </div>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-ring">
              <X size={16} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <AgentChat sessionId={session.id} className="h-full" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
