import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from './types'

const encoder = new TextEncoder()

const adminCookieName = 'lc_admin_session'
const visitorCookieName = 'lc_visitor_id'
const adminSessionMaxAgeSeconds = 60 * 60 * 24 * 14

interface AdminSessionRow {
  expires_at: string
}

function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function createHmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return bytesToBase64Url(new Uint8Array(signature))
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let result = 0

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return result === 0
}

async function secureTextEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])

  return timingSafeEqual(
    bytesToBase64Url(new Uint8Array(leftDigest)),
    bytesToBase64Url(new Uint8Array(rightDigest)),
  )
}

function createRandomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

function parseSessionExpiresAt(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function getSessionSecret(context: Context<AppEnv>): string {
  const secret = context.env.SESSION_SECRET

  if (!secret) {
    throw new HTTPException(500, {
      message: 'SESSION_SECRET が設定されていません。',
    })
  }

  return secret
}

function getAdminPassword(context: Context<AppEnv>): string {
  const password = context.env.ADMIN_PASSWORD

  if (!password) {
    throw new HTTPException(500, {
      message: 'ADMIN_PASSWORD が設定されていません。',
    })
  }

  return password
}

export async function verifyAdminPassword(
  context: Context<AppEnv>,
  password: string,
): Promise<boolean> {
  return secureTextEqual(password, getAdminPassword(context))
}

async function createSessionHash(context: Context<AppEnv>, token: string): Promise<string> {
  return createHmac(token, getSessionSecret(context))
}

async function deleteAdminSessionRecord(context: Context<AppEnv>, token: string | null): Promise<void> {
  if (!token) {
    return
  }

  await context.env.DB
    .prepare('DELETE FROM admin_sessions WHERE session_hash = ?')
    .bind(await createSessionHash(context, token))
    .run()
}

export async function createAdminSessionToken(context: Context<AppEnv>): Promise<string> {
  const existingToken = getCookie(context, adminCookieName) ?? null
  await deleteAdminSessionRecord(context, existingToken)

  const token = createRandomToken()
  const expiresAt = new Date(Date.now() + adminSessionMaxAgeSeconds * 1000).toISOString()

  await context.env.DB
    .prepare(
      `INSERT INTO admin_sessions (session_hash, expires_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(await createSessionHash(context, token), expiresAt)
    .run()

  return token
}

export async function isAdminAuthenticated(context: Context<AppEnv>): Promise<boolean> {
  const token = getCookie(context, adminCookieName)

  if (!token) {
    return false
  }

  const session = await context.env.DB
    .prepare(
      `SELECT expires_at
       FROM admin_sessions
       WHERE session_hash = ?`,
    )
    .bind(await createSessionHash(context, token))
    .first<AdminSessionRow>()

  if (!session) {
    return false
  }

  const expiresAt = parseSessionExpiresAt(session.expires_at)

  if (!expiresAt || expiresAt < Date.now()) {
    await deleteAdminSessionRecord(context, token)
    return false
  }

  return true
}

export function setAdminSessionCookie(context: Context<AppEnv>, token: string): void {
  setCookie(context, adminCookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(context.req.url),
    maxAge: adminSessionMaxAgeSeconds,
  })
}

export function clearAdminSessionCookie(context: Context<AppEnv>): void {
  deleteCookie(context, adminCookieName, {
    path: '/',
  })
}

export async function invalidateAdminSession(context: Context<AppEnv>): Promise<void> {
  const token = getCookie(context, adminCookieName) ?? null
  await deleteAdminSessionRecord(context, token)
  clearAdminSessionCookie(context)
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (context, next) => {
  if (!(await isAdminAuthenticated(context))) {
    throw new HTTPException(401, {
      message: '管理画面にログインしてください。',
    })
  }

  await next()
}

export function ensureVisitorId(context: Context<AppEnv>): string {
  const existingVisitorId = getCookie(context, visitorCookieName)

  if (existingVisitorId) {
    return existingVisitorId
  }

  const visitorId = crypto.randomUUID()

  setCookie(context, visitorCookieName, visitorId, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(context.req.url),
    maxAge: 60 * 60 * 24 * 365,
  })

  return visitorId
}

export function getVisitorId(context: Context<AppEnv>): string | null {
  return getCookie(context, visitorCookieName) ?? null
}
