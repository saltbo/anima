import { useState, useCallback } from 'react'
import type { LoaderFunctionArgs } from 'react-router-dom'
import type { MilestoneDetailLoaderData } from '@/types/router'
import type { Iteration } from '@/types/index'
import {
  MilestoneDetailHeader,
  ReviewBanner,
  DescriptionSection,
  Timeline,
  BottomActionBar,
  MilestoneDetailSidebar,
  SessionDrawer,
  DeleteDialog,
  CancelDialog,
  RollbackDialog,
  RequestChangesDialog,
  useMilestoneDetail,
} from '@/components/milestone-detail'

export const milestoneDetailLoader = async ({ params }: LoaderFunctionArgs) => {
  const { id, mid } = params
  const [milestones, inboxItems, markdown, comments] = await Promise.all([
    window.electronAPI.getMilestones(id!),
    window.electronAPI.getInboxItems(id!),
    window.electronAPI.readMilestoneMarkdown(id!, mid!),
    window.electronAPI.getMilestoneComments(mid!),
  ])
  const milestone = milestones.find((m) => m.id === mid) ?? null
  return {
    meta: { title: milestone?.title ?? '' },
    milestone, inboxItems, markdown: markdown ?? '', comments,
  } satisfies MilestoneDetailLoaderData
}

export function MilestoneDetail() {
  const {
    // Core data
    milestone, comments, gitInfo, iterations,
    commentText, setCommentText,

    // Derived
    completedTaskCount, totalTaskCount,
    passedACCount, totalACCount,

    // Dialog state
    deleteOpen, setDeleteOpen,
    cancelOpen, setCancelOpen,
    rollbackOpen, setRollbackOpen,
    requestChangesOpen, setRequestChangesOpen,
    requestChangesText, setRequestChangesText,

    // Actions
    handleDelete, handleCancel,
    handleAcceptMerge, handleRollback,
    handleRequestChanges, handleAddComment,
    handleCloseWithComment,
  } = useMilestoneDetail()

  // Session drawer state
  const [drawerSession, setDrawerSession] = useState<{
    iteration: Iteration
    role: 'developer' | 'acceptor'
    displayNum: number
  } | null>(null)

  const handleViewSession = useCallback(
    (role: 'developer' | 'acceptor', iteration: Iteration) => {
      // Compute 1-based display number from iterations array order
      const displayNum = iterations.findIndex((it) => it === iteration) + 1
      setDrawerSession({ iteration, role, displayNum: displayNum || iteration.round })
    },
    [iterations],
  )

  if (!milestone) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Milestone not found.</p>
      </div>
    )
  }

  const isInProgress = milestone.status === 'in-progress'

  return (
    <div className="h-full bg-background">
      <div className="flex min-h-0">
        {/* ── Main Content Column ──────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <MilestoneDetailHeader milestone={milestone} />

          <ReviewBanner status={milestone.status} gitInfo={gitInfo} />

          <DescriptionSection description={milestone.description} />

          <Timeline
            comments={comments}
            iterations={iterations}
            onViewSession={handleViewSession}
          />

          <BottomActionBar
            status={milestone.status}
            completedTaskCount={completedTaskCount}
            totalTaskCount={totalTaskCount}
            passedACCount={passedACCount}
            totalACCount={totalACCount}
            iterationCount={iterations.length}
            commentText={commentText}
            onCommentChange={setCommentText}
            onCommentSubmit={handleAddComment}
            onAcceptMerge={handleAcceptMerge}
            onRollback={() => setRollbackOpen(true)}
            onCloseWithComment={handleCloseWithComment}
          />
        </div>

        {/* ── Right Sidebar ────────────────────────────────────── */}
        <MilestoneDetailSidebar
          milestone={milestone}
          gitInfo={gitInfo}
          iterations={iterations}
        />
      </div>

      {/* ── Dialogs ──────────────────────────────────────────── */}
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={milestone.title}
        onDelete={handleDelete}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isInProgress={isInProgress}
        onCancel={handleCancel}
      />
      <RollbackDialog
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        onRollback={handleRollback}
      />
      <RequestChangesDialog
        open={requestChangesOpen}
        onOpenChange={setRequestChangesOpen}
        value={requestChangesText}
        onChange={setRequestChangesText}
        onSubmit={handleRequestChanges}
      />
      <SessionDrawer
        open={drawerSession !== null}
        onOpenChange={(open) => { if (!open) setDrawerSession(null) }}
        iteration={drawerSession?.iteration ?? null}
        initialRole={drawerSession?.role}
        displayNum={drawerSession?.displayNum}
      />
    </div>
  )
}
