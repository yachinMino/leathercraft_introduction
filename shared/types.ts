import { masterCategoryOrder, reactionTypes } from './constants'

export type MasterCategory = (typeof masterCategoryOrder)[number]
export type ReactionType = (typeof reactionTypes)[number]

export type MasterCatalog = Record<MasterCategory, string[]>

export interface WorkInput {
  title: string
  leatherColor: string
  grain: string
  threadColor: string
  edgeFinishes: string[]
  tanningMethod: string
  listingUrl: string
  description: string
  notes: string
}

export interface WorkImage {
  id: number
  url: string
  filename: string
  sortOrder: number
}

export interface ReactionCounts {
  like: number
  request: number
}

export interface ViewerReactions {
  like: boolean
  request: boolean
}

export interface WorkCard extends WorkInput {
  id: number
  coverImageUrl: string | null
  createdAt: string
  updatedAt: string
  reactionCounts: ReactionCounts
}

export interface WorkDetail extends WorkCard {
  images: WorkImage[]
  viewerReactions: ViewerReactions
}

export interface WorkListResponse {
  works: WorkCard[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface AdminSessionResponse {
  authenticated: boolean
}

export interface AdminOverviewResponse {
  works: WorkCard[]
  masters: MasterCatalog
}

export interface ReactionResponse {
  reactionCounts: ReactionCounts
  viewerReactions: ViewerReactions
}

export function createEmptyMasterCatalog(): MasterCatalog {
  return {
    leatherColor: [],
    grain: [],
    threadColor: [],
    edgeFinish: [],
    tanningMethod: [],
  }
}

export function createEmptyViewerReactions(): ViewerReactions {
  return {
    like: false,
    request: false,
  }
}
