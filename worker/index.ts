import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import { maxImagesPerWork, publicWorksPageSize } from '../shared/constants'
import { createEmptyViewerReactions } from '../shared/types'
import type { WorkDetail } from '../shared/types'
import {
  createAdminSessionToken,
  ensureVisitorId,
  getVisitorId,
  invalidateAdminSession,
  isAdminAuthenticated,
  requireAdmin,
  setAdminSessionCookie,
  verifyAdminPassword,
} from './auth'
import {
  assertWorkExists,
  createWorkRecord,
  deleteWorkRecord,
  getMasterCatalog,
  getReactionResponse,
  getWorkDetail,
  insertWorkImage,
  listWorkImages,
  listWorks,
  listWorksPage,
  removeWorkImages,
  replaceMasterCatalog,
  replaceWorkEdgeFinishes,
  resequenceWorkImages,
  updateWorkRecord,
} from './db'
import type { StoredWorkImage } from './db'
import type { AppBindings, AppEnv } from './types'
import {
  assertValidWorkSelections,
  loginSchema,
  parseMasterCatalog,
  parseReactionType,
  parseWorkFormData,
} from './validation'
import {
  applyApiSecurityHeaders,
  assertLoginAttemptAllowed,
  clearLoginAttempts,
  getLoginAttemptKey,
  recordFailedLoginAttempt,
  requireSameOriginForAdminWrites,
} from './security'

interface UploadedImage {
  imageKey: string
  filename: string
  contentType: string
  sortOrder: number
}

const app = new Hono<AppEnv>()
const admin = new Hono<AppEnv>()

app.use('/api/*', applyApiSecurityHeaders)
app.use('/api/admin/*', requireSameOriginForAdminWrites)

function parseWorkId(value: string): number {
  const workId = Number(value)

  if (!Number.isInteger(workId) || workId <= 0) {
    throw new HTTPException(400, {
      message: '作品 ID が不正です。',
    })
  }

  return workId
}

function parsePage(value?: string): number {
  if (!value) {
    return 1
  }

  const page = Number(value)

  if (!Number.isInteger(page) || page <= 0) {
    throw new HTTPException(400, {
      message: 'page は 1 以上の整数で指定してください。',
    })
  }

  return page
}

function getFileExtension(file: File): string {
  const fileNameExtension = file.name.split('.').pop()?.toLowerCase()

  if (fileNameExtension && /^[a-z0-9]+$/.test(fileNameExtension)) {
    return fileNameExtension
  }

  if (file.type === 'image/jpeg') {
    return 'jpg'
  }

  if (file.type === 'image/png') {
    return 'png'
  }

  if (file.type === 'image/webp') {
    return 'webp'
  }

  return 'bin'
}

async function deleteImagesFromR2(bindings: AppBindings, images: readonly StoredWorkImage[]): Promise<void> {
  for (const image of images) {
    await bindings.WORK_IMAGES.delete(image.imageKey)
  }
}

async function uploadImages(
  bindings: AppBindings,
  workId: number,
  files: readonly File[],
  startSortOrder: number,
): Promise<UploadedImage[]> {
  const uploadedImages: UploadedImage[] = []

  try {
    for (const [index, file] of files.entries()) {
      const imageKey = `${workId}/${crypto.randomUUID()}.${getFileExtension(file)}`
      const uploadedImage = {
        imageKey,
        filename: file.name || `image-${index + 1}`,
        contentType: file.type || 'application/octet-stream',
        sortOrder: startSortOrder + index,
      }

      await bindings.WORK_IMAGES.put(imageKey, file.stream(), {
        httpMetadata: {
          contentType: uploadedImage.contentType,
        },
      })

      uploadedImages.push(uploadedImage)
    }
  } catch (error) {
    for (const image of uploadedImages) {
      await bindings.WORK_IMAGES.delete(image.imageKey)
    }

    throw error
  }

  return uploadedImages
}

async function persistUploadedImages(
  bindings: AppBindings,
  database: D1Database,
  workId: number,
  uploadedImages: readonly UploadedImage[],
): Promise<void> {
  try {
    for (const image of uploadedImages) {
      await insertWorkImage(database, workId, image)
    }
  } catch (error) {
    for (const image of uploadedImages) {
      await bindings.WORK_IMAGES.delete(image.imageKey)
    }

    throw error
  }
}

async function requireWorkDetail(
  database: D1Database,
  workId: number,
  visitorId?: string | null,
): Promise<WorkDetail> {
  const work = await getWorkDetail(database, workId, visitorId)

  if (!work) {
    throw new HTTPException(404, {
      message: '作品が見つかりません。',
    })
  }

  return work
}

function mergeCatalogWithWork(
  masters: Awaited<ReturnType<typeof getMasterCatalog>>,
  work: WorkDetail,
): Awaited<ReturnType<typeof getMasterCatalog>> {
  return {
    leatherColor: Array.from(new Set([...masters.leatherColor, work.leatherColor])),
    grain: Array.from(new Set([...masters.grain, work.grain])),
    threadColor: Array.from(new Set([...masters.threadColor, work.threadColor])),
    edgeFinish: Array.from(new Set([...masters.edgeFinish, ...work.edgeFinishes])),
    tanningMethod: Array.from(new Set([...masters.tanningMethod, work.tanningMethod])),
  }
}

app.onError((error, context) => {
  if (error instanceof HTTPException) {
    return context.json({ error: error.message }, error.status)
  }

  if (error instanceof ZodError) {
    return context.json({ error: error.issues[0]?.message ?? '入力内容を確認してください。' }, 400)
  }

  console.error(error)
  return context.json({ error: 'サーバーでエラーが発生しました。' }, 500)
})

app.get('/api/works', async (context) => {
  const page = parsePage(context.req.query('page'))
  return context.json(await listWorksPage(context.env.DB, page, publicWorksPageSize))
})

app.get('/api/works/:id', async (context) => {
  const workId = parseWorkId(context.req.param('id'))
  const visitorId = getVisitorId(context)
  return context.json(await requireWorkDetail(context.env.DB, workId, visitorId))
})

app.post('/api/works/:id/reactions', async (context) => {
  const workId = parseWorkId(context.req.param('id'))
  await assertWorkExists(context.env.DB, workId)

  const reactionType = parseReactionType(await context.req.json())
  const visitorId = ensureVisitorId(context)

  await context.env.DB
    .prepare(
      `INSERT OR IGNORE INTO work_reactions (work_id, reaction_type, visitor_id)
       VALUES (?, ?, ?)`,
    )
    .bind(workId, reactionType, visitorId)
    .run()

  return context.json(await getReactionResponse(context.env.DB, workId, visitorId))
})

app.get('/api/images/:encodedKey', async (context) => {
  const encodedKey = context.req.param('encodedKey')
  const imageKey = decodeURIComponent(encodedKey)
  const object = await context.env.WORK_IMAGES.get(imageKey)

  if (!object) {
    throw new HTTPException(404, {
      message: '画像が見つかりません。',
    })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')

  return new Response(object.body, { headers })
})

app.get('/api/admin/session', async (context) => {
  return context.json({
    authenticated: await isAdminAuthenticated(context),
  })
})

app.post('/api/admin/session', async (context) => {
  const attemptKey = getLoginAttemptKey(context)
  await assertLoginAttemptAllowed(context.env.DB, attemptKey)

  const payload = loginSchema.parse(await context.req.json())

  if (!(await verifyAdminPassword(context, payload.password))) {
    await recordFailedLoginAttempt(context.env.DB, attemptKey)
    throw new HTTPException(401, {
      message: 'パスワードが間違っています。',
    })
  }

  await clearLoginAttempts(context.env.DB, attemptKey)
  setAdminSessionCookie(context, await createAdminSessionToken(context))

  return context.json({
    authenticated: true,
  })
})

app.delete('/api/admin/session', async (context) => {
  await invalidateAdminSession(context)

  return context.json({
    authenticated: false,
  })
})

admin.use('*', requireAdmin)

admin.get('/overview', async (context) => {
  const [works, masters] = await Promise.all([
    listWorks(context.env.DB),
    getMasterCatalog(context.env.DB),
  ])

  return context.json({
    works,
    masters,
  })
})

admin.get('/works/:id', async (context) => {
  const workId = parseWorkId(context.req.param('id'))
  const work = await requireWorkDetail(context.env.DB, workId)

  return context.json({
    ...work,
    viewerReactions: createEmptyViewerReactions(),
  })
})

admin.post('/works', async (context) => {
  const formData = await context.req.raw.formData()
  const { input, images } = await parseWorkFormData(formData)
  const masters = await getMasterCatalog(context.env.DB)
  assertValidWorkSelections(input, masters)

  const workId = await createWorkRecord(context.env.DB, input)

  try {
    await replaceWorkEdgeFinishes(context.env.DB, workId, input.edgeFinishes)

    const uploadedImages = await uploadImages(context.env, workId, images, 0)
    await persistUploadedImages(context.env, context.env.DB, workId, uploadedImages)
  } catch (error) {
    const imagesToDelete = await deleteWorkRecord(context.env.DB, workId)
    await deleteImagesFromR2(context.env, imagesToDelete)
    throw error
  }

  return context.json(await requireWorkDetail(context.env.DB, workId), 201)
})

admin.put('/works/:id', async (context) => {
  const workId = parseWorkId(context.req.param('id'))
  await assertWorkExists(context.env.DB, workId)

  const formData = await context.req.raw.formData()
  const { input, images, removeImageIds } = await parseWorkFormData(formData)
  const masters = await getMasterCatalog(context.env.DB)
  const currentWork = await requireWorkDetail(context.env.DB, workId)
  assertValidWorkSelections(input, mergeCatalogWithWork(masters, currentWork))

  const existingImages = await listWorkImages(context.env.DB, workId)
  const imagesToRemove = existingImages.filter((image) => removeImageIds.includes(image.id))
  const remainingImages = existingImages.filter((image) => !removeImageIds.includes(image.id))

  if (remainingImages.length + images.length > maxImagesPerWork) {
    throw new HTTPException(400, {
      message: `画像は ${maxImagesPerWork} 枚までです。`,
    })
  }

  const uploadedImages = await uploadImages(context.env, workId, images, remainingImages.length)

  try {
    await updateWorkRecord(context.env.DB, workId, input)
    await replaceWorkEdgeFinishes(context.env.DB, workId, input.edgeFinishes)
    await removeWorkImages(context.env.DB, workId, removeImageIds)
    await persistUploadedImages(context.env, context.env.DB, workId, uploadedImages)
    await resequenceWorkImages(context.env.DB, workId)
    await deleteImagesFromR2(context.env, imagesToRemove)
  } catch (error) {
    for (const uploadedImage of uploadedImages) {
      await context.env.WORK_IMAGES.delete(uploadedImage.imageKey)
    }

    throw error
  }

  return context.json(await requireWorkDetail(context.env.DB, workId))
})

admin.delete('/works/:id', async (context) => {
  const workId = parseWorkId(context.req.param('id'))
  await assertWorkExists(context.env.DB, workId)

  const deletedImages = await deleteWorkRecord(context.env.DB, workId)
  await deleteImagesFromR2(context.env, deletedImages)

  return context.json({
    success: true,
  })
})

admin.put('/masters', async (context) => {
  const catalog = parseMasterCatalog(await context.req.json())
  await replaceMasterCatalog(context.env.DB, catalog)
  return context.json(await getMasterCatalog(context.env.DB))
})

app.route('/api/admin', admin)

export default app
