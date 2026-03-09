export const maxImagesPerWork = 4
export const maxImageSizeBytes = 5 * 1024 * 1024
export const adminPasswordMaxLength = 50
export const allowedUploadImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

export const masterCategoryOrder = [
  'leatherColor',
  'grain',
  'threadColor',
  'edgeFinish',
  'tanningMethod',
] as const

export const masterCategoryLabels: Record<(typeof masterCategoryOrder)[number], string> = {
  leatherColor: '革の色',
  grain: 'シボ',
  threadColor: '糸の色',
  edgeFinish: 'ヘリの処理',
  tanningMethod: '鞣し方',
}

export const reactionTypes = ['like', 'request'] as const

export const reactionTypeLabels: Record<(typeof reactionTypes)[number], string> = {
  like: 'いいね',
  request: 'リクエスト',
}
