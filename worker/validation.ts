import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

import {
  adminPasswordMaxLength,
  allowedUploadImageTypes,
  maxImageSizeBytes,
  maxImagesPerWork,
  reactionTypes,
} from '../shared/constants'
import type { MasterCatalog, ReactionType, WorkInput } from '../shared/types'

const textField = z.string().trim().min(1).max(100)
const notesField = z.string().trim().max(4000)
const listingUrlField = z
  .string()
  .trim()
  .max(500, '出品リンクは 500 文字以内で入力してください。')
  .refine((value) => {
    if (value.length === 0) {
      return true
    }

    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, '出品リンクは http または https の URL を入力してください。')

const workSchema = z.object({
  title: textField,
  leatherColor: textField,
  grain: textField,
  threadColor: textField,
  tanningMethod: textField,
  listingUrl: listingUrlField,
  notes: notesField,
  edgeFinishes: z.array(textField).max(20),
})

const masterCatalogSchema = z.object({
  leatherColor: z.array(textField).min(1).max(50),
  grain: z.array(textField).min(1).max(20),
  threadColor: z.array(textField).min(1).max(20),
  edgeFinish: z.array(textField).min(1).max(20),
  tanningMethod: z.array(textField).min(1).max(20),
})

export const loginSchema = z.object({
  password: z
    .string()
    .trim()
    .min(1, 'パスワードを入力してください。')
    .max(adminPasswordMaxLength, `パスワードは ${adminPasswordMaxLength} 文字以内で入力してください。`),
})

export const reactionSchema = z.object({
  type: z.enum(reactionTypes),
})

function normalizeOptions(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values))
}

function assertNoDuplicates(values: string[], label: string): void {
  const seen = new Set<string>()

  for (const value of values) {
    const normalizedValue = value.toLocaleLowerCase('ja-JP')

    if (seen.has(normalizedValue)) {
      throw new HTTPException(400, {
        message: `${label} に重複があります。`,
      })
    }

    seen.add(normalizedValue)
  }
}

export function parseMasterCatalog(payload: unknown): MasterCatalog {
  const parsed = masterCatalogSchema.parse(payload)
  const catalog: MasterCatalog = {
    leatherColor: normalizeOptions(parsed.leatherColor),
    grain: normalizeOptions(parsed.grain),
    threadColor: normalizeOptions(parsed.threadColor),
    edgeFinish: normalizeOptions(parsed.edgeFinish),
    tanningMethod: normalizeOptions(parsed.tanningMethod),
  }

  assertNoDuplicates(catalog.leatherColor, '革の色')
  assertNoDuplicates(catalog.grain, 'シボ')
  assertNoDuplicates(catalog.threadColor, '糸の色')
  assertNoDuplicates(catalog.edgeFinish, 'ヘリの処理')
  assertNoDuplicates(catalog.tanningMethod, '鞣し方')

  return catalog
}

export async function parseWorkFormData(formData: FormData): Promise<{
  input: WorkInput
  images: File[]
  removeImageIds: number[]
}> {
  const imageEntries = formData.getAll('images')
  const images = imageEntries.filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (images.length > maxImagesPerWork) {
    throw new HTTPException(400, {
      message: `画像は ${maxImagesPerWork} 枚までです。`,
    })
  }

  for (const file of images) {
    if (!allowedUploadImageTypes.includes(file.type as (typeof allowedUploadImageTypes)[number])) {
      throw new HTTPException(400, {
        message: 'JPEG / PNG / WebP 画像のみアップロードできます。',
      })
    }

    if (file.size > maxImageSizeBytes) {
      throw new HTTPException(400, {
        message: `画像は 1 枚あたり ${(maxImageSizeBytes / 1024 / 1024).toFixed(0)}MB 以下にしてください。`,
      })
    }
  }

  const removeImageIdsRaw = formData.get('removeImageIds')
  let removeImageIds: number[] = []

  if (removeImageIdsRaw) {
    try {
      removeImageIds = z
        .array(z.number().int().positive())
        .parse(JSON.parse(String(removeImageIdsRaw)))
    } catch {
      throw new HTTPException(400, {
        message: '削除対象画像の指定が不正です。',
      })
    }
  }

  const input = workSchema.parse({
    title: formData.get('title') ?? '',
    leatherColor: formData.get('leatherColor') ?? '',
    grain: formData.get('grain') ?? '',
    threadColor: formData.get('threadColor') ?? '',
    tanningMethod: formData.get('tanningMethod') ?? '',
    listingUrl: formData.get('listingUrl') ?? '',
    notes: formData.get('notes') ?? '',
    edgeFinishes: formData.getAll('edgeFinishes').map((value) => String(value)),
  })

  return {
    input: {
      ...input,
      notes: input.notes ?? '',
      edgeFinishes: uniqueOptions(normalizeOptions(input.edgeFinishes)),
    },
    images,
    removeImageIds,
  }
}

function assertOptionInCatalog(categoryLabel: string, value: string, options: string[]): void {
  if (!options.includes(value)) {
    throw new HTTPException(400, {
      message: `${categoryLabel} の選択が不正です。`,
    })
  }
}

export function assertValidWorkSelections(input: WorkInput, catalog: MasterCatalog): void {
  assertOptionInCatalog('革の色', input.leatherColor, catalog.leatherColor)
  assertOptionInCatalog('シボ', input.grain, catalog.grain)
  assertOptionInCatalog('糸の色', input.threadColor, catalog.threadColor)
  assertOptionInCatalog('鞣し方', input.tanningMethod, catalog.tanningMethod)

  for (const edgeFinish of input.edgeFinishes) {
    assertOptionInCatalog('ヘリの処理', edgeFinish, catalog.edgeFinish)
  }
}

export function parseReactionType(payload: unknown): ReactionType {
  return reactionSchema.parse(payload).type
}
