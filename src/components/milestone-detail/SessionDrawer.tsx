import { useState, useCallback, useEffect } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, Code, ShieldCheck } from 'lucide-react'
import { formatTokens, formatElapsed } from '@/lib/time'
import { AgentChat } from '@/components/AgentChat'
import { cn } from '@/lib/utils'
import type { Iteration } from '@/types/index'

type Role = 'developer' | 'acceptor'

export interface SessionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  iteration: Iteration | null
  /** Which tab to show initially */
  initialRole?: Role
  /** 1-based display number for the iteration */
  displayNum?: number
}

export function SessionDrawer({
  open,
  onOpenChange,
  iteration,
  initialRole = 'developer',
  displayNum,
}: SessionDrawerProps) {
  const [activeRole, setActiveRole] = useState<Role>(initialRole)

  // Sync active tab whenever the caller changes initialRole (e.g. clicking
  // Acceptor "View Session →" while drawer is already open for Developer)
  useEffect(() => {
    setActiveRole(initialRole)
  }, [initialRole])

  // Reset active role when the drawer opens with a new initial role
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) setActiveRole(initialRole)
      onOpenChange(nextOpen)
    },
    [initialRole, onOpenChange],
  )

  if (!iteration) return null

  const sessionId =
    activeRole === 'developer'
      ? iteration.developerSessionId
      : iteration.acceptorSessionId

  const num = displayNum ?? iteration.round
  const tokens = iteration.totalTokens
    ? Math.round(iteration.totalTokens * (activeRole === 'developer' ? 0.6 : 0.4))
    : undefined
  const cost = iteration.totalCost
    ? iteration.totalCost * (activeRole === 'developer' ? 0.6 : 0.4)
    : undefined

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />

        {/* Drawer panel */}
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-border bg-background shadow-2xl data-[state=open]:animate-slide-in-from-right data-[state=closed]:animate-slide-out-to-right focus:outline-none"
          aria-describedby={undefined}
        >
          {/* ── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground truncate">
                Iteration #{num} — {activeRole === 'developer' ? 'Developer' : 'Acceptor'} Session
              </DialogPrimitive.Title>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{formatElapsed(iteration.startedAt, iteration.completedAt)}</span>
                {tokens !== undefined && <span>{formatTokens(tokens)} tokens</span>}
                {cost !== undefined && <span>${cost.toFixed(2)}</span>}
              </div>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-ring">
              <X size={16} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* ── Tab Bar ──────────────────────────────────── */}
          <div className="flex border-b border-border px-5">
            <TabButton
              active={activeRole === 'developer'}
              onClick={() => setActiveRole('developer')}
              icon={<Code size={13} />}
              label="Developer"
              disabled={!iteration.developerSessionId}
            />
            <TabButton
              active={activeRole === 'acceptor'}
              onClick={() => setActiveRole('acceptor')}
              icon={<ShieldCheck size={13} />}
              label="Acceptor"
              disabled={!iteration.acceptorSessionId}
            />
          </div>

          {/* ── Content ─────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {sessionId ? (
              <AgentChat sessionId={sessionId} className="h-full" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">No session recorded.</p>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ── TabButton ──────────────────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground/80',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
      {/* Active underline */}
      {active && (
        <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-primary" />
      )}
    </button>
  )
}
