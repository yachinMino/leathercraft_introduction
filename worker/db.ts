import { HTTPException } from 'hono/http-exception'

import { createEmptyMasterCatalog, createEmptyViewerReactions } from '../shared/types'
import type {
  MasterCatalog,
  ReactionCounts,
  ReactionResponse,
  ReactionType,
  ViewerReactions,
  WorkCard,
  WorkDetail,
  WorkInput,
  WorkListResponse,
} from '../shared/types'

interface MasterRow {
  category: keyof MasterCatalog
  label: string
}

interface WorkSummaryRow {
  id: number
  title: string
  leather_color: string
  grain: string
  thread_color: string
  tanning_method: string
  listing_url: string
  description: string
  notes: string
  created_at: string
  updated_at: string
  cover_image_key: string | null
  like_count: number
  request_count: number
}

interface WorkEdgeRow {
  work_id: number
  edge_finish: string
}

interface WorkImageRow {
  id: number
  work_id: number
  image_key: string
  filename: string
  content_type: string
  sort_order: number
}

interface ReactionCountRow {
  like_count: number
  request_count: number
}

interface ReactionRow {
  reaction_type: ReactionType
}

export interface StoredWorkImage {
  id: number
  workId: number
  imageKey: string
  filename: string
  contentType: string
  sortOrder: number
}

function createInClause(values: readonly number[]): string {
  return values.map(() => '?').join(', ')
}

function buildImageUrl(imageKey: string): string {
  return `/api/images/${encodeURIComponent(imageKey)}`
}

function normalizeReactionCounts(row: ReactionCountRow | null | undefined): ReactionCounts {
  return {
    like: Number(row?.like_count ?? 0),
    request: Number(row?.request_count ?? 0),
  }
}

function rowToWorkCard(row: WorkSummaryRow, edgeFinishes: string[]): WorkCard {
  return {
    id: Number(row.id),
    title: row.title,
    leatherColor: row.leather_color,
    grain: row.grain,
    threadColor: row.thread_color,
    edgeFinishes,
    tanningMethod: row.tanning_method,
    listingUrl: row.listing_url,
    description: row.description,
    notes: row.notes,
    coverImageUrl: row.cover_image_key ? buildImageUrl(row.cover_image_key) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactionCounts: {
      like: Number(row.like_count ?? 0),
      request: Number(row.request_count ?? 0),
    },
  }
}

function rowToStoredWorkImage(row: WorkImageRow): StoredWorkImage {
  return {
    id: Number(row.id),
    workId: Number(row.work_id),
    imageKey: row.image_key,
    filename: row.filename,
    contentType: row.content_type,
    sortOrder: Number(row.sort_order),
  }
}

async function hydrateWorkCards(
  database: D1Database,
  workRows: readonly WorkSummaryRow[],
): Promise<WorkCard[]> {
  const workIds = workRows.map((row) => Number(row.id))
  const edgeFinishesByWork = await listEdgeFinishesByWork(database, workIds)

  return workRows.map((row) => rowToWorkCard(row, edgeFinishesByWork.get(Number(row.id)) ?? []))
}

async function listEdgeFinishesByWork(
  database: D1Database,
  workIds: readonly number[],
): Promise<Map<number, string[]>> {
  const edgeFinishesByWork = new Map<number, string[]>()

  if (workIds.length === 0) {
    return edgeFinishesByWork
  }

  const { results } = await database
    .prepare(
      `SELECT work_id, edge_finish
       FROM work_edge_finishes
       WHERE work_id IN (${createInClause(workIds)})
       ORDER BY work_id ASC, sort_order ASC, edge_finish ASC`,
    )
    .bind(...workIds)
    .all<WorkEdgeRow>()

  for (const row of results ?? []) {
    const workId = Number(row.work_id)
    const edgeFinishes = edgeFinishesByWork.get(workId) ?? []
    edgeFinishes.push(row.edge_finish)
    edgeFinishesByWork.set(workId, edgeFinishes)
  }

  return edgeFinishesByWork
}

export async function getMasterCatalog(database: D1Database): Promise<MasterCatalog> {
  const { results } = await database
    .prepare(
      `SELECT category, label
       FROM master_options
       ORDER BY category ASC, sort_order ASC, id ASC`,
    )
    .all<MasterRow>()

  const catalog = createEmptyMasterCatalog()

  for (const row of results ?? []) {
    catalog[row.category].push(row.label)
  }

  return catalog
}

export async function replaceMasterCatalog(
  database: D1Database,
  catalog: MasterCatalog,
): Promise<void> {
  const statements = [
    database.prepare('DELETE FROM master_options'),
    ...Object.entries(catalog).flatMap(([category, labels]) =>
      labels.map((label, index) =>
        database
          .prepare(
            'INSERT INTO master_options (category, label, sort_order, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          )
          .bind(category, label, index),
      ),
    ),
  ]

  await database.batch(statements)
}

export async function listWorks(database: D1Database): Promise<WorkCard[]> {
  const { results } = await database
    .prepare(
      `SELECT
         w.id,
         w.title,
         w.leather_color,
         w.grain,
         w.thread_color,
         w.tanning_method,
         w.listing_url,
         w.description,
         w.notes,
         w.created_at,
         w.updated_at,
         (
           SELECT wi.image_key
           FROM work_images wi
           WHERE wi.work_id = w.id
           ORDER BY wi.sort_order ASC, wi.id ASC
           LIMIT 1
         ) AS cover_image_key,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'like'
         ) AS like_count,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'request'
         ) AS request_count
       FROM works w
       ORDER BY w.updated_at DESC, w.id DESC`,
    )
    .all<WorkSummaryRow>()

  return hydrateWorkCards(database, results ?? [])
}

export async function listWorksPage(
  database: D1Database,
  page: number,
  pageSize: number,
): Promise<WorkListResponse> {
  const totalRow = await database
    .prepare(
      `SELECT COUNT(*) AS total_count
       FROM works`,
    )
    .first<{ total_count: number }>()

  const totalCount = Number(totalRow?.total_count ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const normalizedPage = Math.min(Math.max(page, 1), totalPages)
  const offset = (normalizedPage - 1) * pageSize

  const { results } = await database
    .prepare(
      `SELECT
         w.id,
         w.title,
         w.leather_color,
         w.grain,
         w.thread_color,
         w.tanning_method,
         w.listing_url,
         w.description,
         w.notes,
         w.created_at,
         w.updated_at,
         (
           SELECT wi.image_key
           FROM work_images wi
           WHERE wi.work_id = w.id
           ORDER BY wi.sort_order ASC, wi.id ASC
           LIMIT 1
         ) AS cover_image_key,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'like'
         ) AS like_count,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'request'
         ) AS request_count
       FROM works w
       ORDER BY w.updated_at DESC, w.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(pageSize, offset)
    .all<WorkSummaryRow>()

  return {
    works: await hydrateWorkCards(database, results ?? []),
    page: normalizedPage,
    pageSize,
    totalCount,
    totalPages,
  }
}

export async function getWorkDetail(
  database: D1Database,
  workId: number,
  visitorId?: string | null,
): Promise<WorkDetail | null> {
  const workRow = await database
    .prepare(
      `SELECT
         w.id,
         w.title,
         w.leather_color,
         w.grain,
         w.thread_color,
         w.tanning_method,
         w.listing_url,
         w.description,
         w.notes,
         w.created_at,
         w.updated_at,
         (
           SELECT wi.image_key
           FROM work_images wi
           WHERE wi.work_id = w.id
           ORDER BY wi.sort_order ASC, wi.id ASC
           LIMIT 1
         ) AS cover_image_key,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'like'
         ) AS like_count,
         (
           SELECT COUNT(*)
           FROM work_reactions wr
           WHERE wr.work_id = w.id AND wr.reaction_type = 'request'
         ) AS request_count
       FROM works w
       WHERE w.id = ?`,
    )
    .bind(workId)
    .first<WorkSummaryRow>()

  if (!workRow) {
    return null
  }

  const [images, edgeFinishesByWork, viewerReactions] = await Promise.all([
    listWorkImages(database, workId),
    listEdgeFinishesByWork(database, [workId]),
    getViewerReactions(database, workId, visitorId),
  ])

  return {
    ...rowToWorkCard(workRow, edgeFinishesByWork.get(workId) ?? []),
    images: images.map((image) => ({
      id: image.id,
      url: buildImageUrl(image.imageKey),
      filename: image.filename,
      sortOrder: image.sortOrder,
    })),
    viewerReactions,
  }
}

export async function assertWorkExists(database: D1Database, workId: number): Promise<void> {
  const work = await database
    .prepare('SELECT id FROM works WHERE id = ?')
    .bind(workId)
    .first<{ id: number }>()

  if (!work) {
    throw new HTTPException(404, {
      message: '作品が見つかりません。',
    })
  }
}

export async function createWorkRecord(database: D1Database, input: WorkInput): Promise<number> {
  const result = await database
    .prepare(
      `INSERT INTO works (
         title,
         leather_color,
         grain,
         thread_color,
         tanning_method,
         listing_url,
         description,
         notes,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      input.title,
      input.leatherColor,
      input.grain,
      input.threadColor,
      input.tanningMethod,
      input.listingUrl,
      input.description,
      input.notes,
    )
    .run()

  const workId = Number(result.meta.last_row_id)

  if (!workId) {
    throw new HTTPException(500, {
      message: '作品の作成に失敗しました。',
    })
  }

  return workId
}

export async function updateWorkRecord(
  database: D1Database,
  workId: number,
  input: WorkInput,
): Promise<void> {
  await database
    .prepare(
      `UPDATE works
       SET
         title = ?,
         leather_color = ?,
         grain = ?,
         thread_color = ?,
         tanning_method = ?,
         listing_url = ?,
         description = ?,
         notes = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      input.title,
      input.leatherColor,
      input.grain,
      input.threadColor,
      input.tanningMethod,
      input.listingUrl,
      input.description,
      input.notes,
      workId,
    )
    .run()
}

export async function replaceWorkEdgeFinishes(
  database: D1Database,
  workId: number,
  edgeFinishes: string[],
): Promise<void> {
  await database.prepare('DELETE FROM work_edge_finishes WHERE work_id = ?').bind(workId).run()

  if (edgeFinishes.length === 0) {
    return
  }

  await database.batch(
    edgeFinishes.map((edgeFinish, index) =>
      database
        .prepare(
          'INSERT INTO work_edge_finishes (work_id, edge_finish, sort_order) VALUES (?, ?, ?)',
        )
        .bind(workId, edgeFinish, index),
    ),
  )
}

export async function listWorkImages(
  database: D1Database,
  workId: number,
): Promise<StoredWorkImage[]> {
  const { results } = await database
    .prepare(
      `SELECT id, work_id, image_key, filename, content_type, sort_order
       FROM work_images
       WHERE work_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .bind(workId)
    .all<WorkImageRow>()

  return (results ?? []).map(rowToStoredWorkImage)
}

export async function insertWorkImage(
  database: D1Database,
  workId: number,
  image: Omit<StoredWorkImage, 'id' | 'workId'>,
): Promise<number> {
  const result = await database
    .prepare(
      `INSERT INTO work_images (work_id, image_key, filename, content_type, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(workId, image.imageKey, image.filename, image.contentType, image.sortOrder)
    .run()

  return Number(result.meta.last_row_id)
}

export async function removeWorkImages(
  database: D1Database,
  workId: number,
  imageIds: readonly number[],
): Promise<StoredWorkImage[]> {
  if (imageIds.length === 0) {
    return []
  }

  const { results } = await database
    .prepare(
      `SELECT id, work_id, image_key, filename, content_type, sort_order
       FROM work_images
       WHERE work_id = ? AND id IN (${createInClause(imageIds)})`,
    )
    .bind(workId, ...imageIds)
    .all<WorkImageRow>()

  await database
    .prepare(`DELETE FROM work_images WHERE work_id = ? AND id IN (${createInClause(imageIds)})`)
    .bind(workId, ...imageIds)
    .run()

  return (results ?? []).map(rowToStoredWorkImage)
}

export async function resequenceWorkImages(database: D1Database, workId: number): Promise<void> {
  const images = await listWorkImages(database, workId)

  if (images.length === 0) {
    return
  }

  await database.batch(
    images.map((image, index) =>
      database.prepare('UPDATE work_images SET sort_order = ? WHERE id = ?').bind(index, image.id),
    ),
  )
}

export async function deleteWorkRecord(
  database: D1Database,
  workId: number,
): Promise<StoredWorkImage[]> {
  const images = await listWorkImages(database, workId)

  await database.batch([
    database.prepare('DELETE FROM work_edge_finishes WHERE work_id = ?').bind(workId),
    database.prepare('DELETE FROM work_images WHERE work_id = ?').bind(workId),
    database.prepare('DELETE FROM work_reactions WHERE work_id = ?').bind(workId),
    database.prepare('DELETE FROM works WHERE id = ?').bind(workId),
  ])

  return images
}

export async function recordReaction(
  database: D1Database,
  workId: number,
  visitorId: string,
  reactionType: ReactionType,
): Promise<void> {
  await database
    .prepare(
      `INSERT OR IGNORE INTO work_reactions (work_id, reaction_type, visitor_id)
       VALUES (?, ?, ?)`,
    )
    .bind(workId, reactionType, visitorId)
    .run()
}

export async function getViewerReactions(
  database: D1Database,
  workId: number,
  visitorId?: string | null,
): Promise<ViewerReactions> {
  const viewerReactions = createEmptyViewerReactions()

  if (!visitorId) {
    return viewerReactions
  }

  const { results } = await database
    .prepare(
      `SELECT reaction_type
       FROM work_reactions
       WHERE work_id = ? AND visitor_id = ?`,
    )
    .bind(workId, visitorId)
    .all<ReactionRow>()

  for (const row of results ?? []) {
    viewerReactions[row.reaction_type] = true
  }

  return viewerReactions
}

export async function getReactionResponse(
  database: D1Database,
  workId: number,
  visitorId?: string | null,
): Promise<ReactionResponse> {
  const [counts, viewerReactions] = await Promise.all([
    database
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN reaction_type = 'like' THEN 1 ELSE 0 END), 0) AS like_count,
           COALESCE(SUM(CASE WHEN reaction_type = 'request' THEN 1 ELSE 0 END), 0) AS request_count
         FROM work_reactions
         WHERE work_id = ?`,
      )
      .bind(workId)
      .first<ReactionCountRow>(),
    getViewerReactions(database, workId, visitorId),
  ])

  return {
    reactionCounts: normalizeReactionCounts(counts),
    viewerReactions,
  }
}
