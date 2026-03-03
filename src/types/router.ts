import type { Milestone, InboxItem, MilestoneComment } from './index'

export interface RouteMeta {
  title: string
}

export type CrumbSegment = {
  label: string
  path?: string
}

export interface RouteHandle {
  crumb?: CrumbSegment[]
}

export interface MilestoneDetailLoaderData {
  meta: RouteMeta
  milestone: Milestone | null
  inboxItems: InboxItem[]
  markdown: string
  comments: MilestoneComment[]
}

export interface InboxDetailLoaderData {
  meta: RouteMeta
  item: InboxItem | null
}
