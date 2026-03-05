import type { Milestone, BacklogItem, MilestoneComment, Action } from './index'

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
  comments: MilestoneComment[]
  actions: Action[]
}

export interface BacklogDetailLoaderData {
  meta: RouteMeta
  item: BacklogItem | null
}
