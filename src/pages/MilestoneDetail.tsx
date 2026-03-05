import { useState } from 'react'
import type { LoaderFunctionArgs } from 'react-router-dom'
import type { MilestoneDetailLoaderData } from '@/types/router'
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
  const [milestones, backlogItems, comments, actions] = await Promise.all([
    window.electronAPI.getMilestones(id!),
    window.electronAPI.getBacklogItems(id!),
    window.electronAPI.getMilestoneComments(mid!),
    window.electronAPI.getActionsByMilestone(mid!),
  ])
  const milestone = milestones.find((m) => m.id === mid) ?? null
  return {
    meta: { title: milestone?.title ?? '' },
    milestone, backlogItems, comments, actions,
  } satisfies MilestoneDetailLoaderData
}

export function MilestoneDetail() {
  const {
    // Core data
    milestone, comments, gitInfo,
    actions, sessions,
    commentText, setCommentText,

    // Derived
    completedTaskCount, totalTaskCount,
    passedACCount, totalACCount,
    iterations,

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
    handleCloseWithComment, handleMarkReady,
  } = useMilestoneDetail()

  // Session drawer state — now driven by sessionId
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null)
  const drawerSession = drawerSessionId
    ? sessions.find((s) => s.id === drawerSessionId) ?? null
    : null

  if (!milestone) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Milestone not found.</p>
      </div>
    )
  }

  const isInProgress = milestone.status === 'in_progress'

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
            actions={actions}
            sessions={sessions}
            onViewSession={setDrawerSessionId}
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
            onApprove={handleMarkReady}
            onCancel={() => setCancelOpen(true)}
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
        open={drawerSessionId !== null}
        onOpenChange={(open) => { if (!open) setDrawerSessionId(null) }}
        session={drawerSession}
      />
    </div>
  )
}
