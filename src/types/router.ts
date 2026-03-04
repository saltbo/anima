import type { Milestone, BacklogItem, MilestoneComment } from './index'

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
  backlogItems: BacklogItem[]
  markdown: string
  comments: MilestoneComment[]
}

export interface BacklogDetailLoaderData {
  meta: RouteMeta
  item: BacklogItem | null
}
