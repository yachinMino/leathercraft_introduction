import { HTTPException } from 'hono/http-exception'
import type { Context, MiddlewareHandler } from 'hono'

import type { AppEnv } from './types'

const loginAttemptWindowMs = 15 * 60 * 1000
const maxFailedLoginAttempts = 5
const unsafeHttpMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface LoginAttemptRow {
  failure_count: number
  first_failed_at: string
  locked_until: string | null
}

function toIsoString(value: Date): string {
  return value.toISOString()
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getForwardedIp(context: Context<AppEnv>): string {
  const forwarded = context.req.header('cf-connecting-ip')
    ?? context.req.header('x-forwarded-for')
    ?? context.req.header('x-real-ip')

  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

function hasExpectedOrigin(candidate: string, expectedOrigin: string): boolean {
  try {
    return new URL(candidate).origin === expectedOrigin
  } catch {
    return false
  }
}

export async function assertLoginAttemptAllowed(
  database: D1Database,
  attemptKey: string,
  now = new Date(),
): Promise<void> {
  const row = await database
    .prepare(
      `SELECT failure_count, first_failed_at, locked_until
       FROM admin_login_attempts
       WHERE attempt_key = ?`,
    )
    .bind(attemptKey)
    .first<LoginAttemptRow>()

  if (!row) {
    return
  }

  const lockedUntil = parseIsoDate(row.locked_until)
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    throw new HTTPException(429, {
      message: 'ログイン試行回数の上限に達しました。時間をおいて再試行してください。',
    })
  }

  const firstFailedAt = parseIsoDate(row.first_failed_at)
  if (!firstFailedAt || now.getTime() - firstFailedAt.getTime() > loginAttemptWindowMs) {
    await clearLoginAttempts(database, attemptKey)
  }
}

export async function recordFailedLoginAttempt(
  database: D1Database,
  attemptKey: string,
  now = new Date(),
): Promise<void> {
  const row = await database
    .prepare(
      `SELECT failure_count, first_failed_at, locked_until
       FROM admin_login_attempts
       WHERE attempt_key = ?`,
    )
    .bind(attemptKey)
    .first<LoginAttemptRow>()

  const nowIso = toIsoString(now)
  const firstFailedAt = parseIsoDate(row?.first_failed_at)
  const shouldResetWindow =
    !row || !firstFailedAt || now.getTime() - firstFailedAt.getTime() > loginAttemptWindowMs

  const nextFailureCount = shouldResetWindow ? 1 : Number(row.failure_count) + 1
  const nextFirstFailedAt = shouldResetWindow ? nowIso : row.first_failed_at
  const lockedUntil =
    nextFailureCount >= maxFailedLoginAttempts
      ? toIsoString(new Date(now.getTime() + loginAttemptWindowMs))
      : null

  await database
    .prepare(
      `INSERT INTO admin_login_attempts (
         attempt_key,
         failure_count,
         first_failed_at,
         locked_until,
         updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(attempt_key) DO UPDATE SET
         failure_count = excluded.failure_count,
         first_failed_at = excluded.first_failed_at,
         locked_until = excluded.locked_until,
         updated_at = excluded.updated_at`,
    )
    .bind(attemptKey, nextFailureCount, nextFirstFailedAt, lockedUntil, nowIso)
    .run()
}

export async function clearLoginAttempts(
  database: D1Database,
  attemptKey: string,
): Promise<void> {
  await database
    .prepare('DELETE FROM admin_login_attempts WHERE attempt_key = ?')
    .bind(attemptKey)
    .run()
}

export function getLoginAttemptKey(context: Context<AppEnv>): string {
  return `admin:${getForwardedIp(context)}`
}

export const requireSameOriginForAdminWrites: MiddlewareHandler<AppEnv> = async (context, next) => {
  if (!unsafeHttpMethods.has(context.req.method)) {
    await next()
    return
  }

  const expectedOrigin = new URL(context.req.url).origin
  const origin = context.req.header('origin')
  const referer = context.req.header('referer')
  const originMatches = origin ? origin === expectedOrigin : false
  const refererMatches = !origin && referer ? hasExpectedOrigin(referer, expectedOrigin) : false

  if (!originMatches && !refererMatches) {
    throw new HTTPException(403, {
      message: '不正な送信元からのリクエストです。',
    })
  }

  await next()
}

export const applyApiSecurityHeaders: MiddlewareHandler<AppEnv> = async (context, next) => {
  await next()

  context.header('X-Content-Type-Options', 'nosniff')
  context.header('X-Frame-Options', 'DENY')
  context.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  context.header('Cross-Origin-Resource-Policy', 'same-origin')

  if (context.req.path.startsWith('/api/admin/')) {
    context.header('Cache-Control', 'no-store')
  }
}
