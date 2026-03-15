import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  adminPasswordMaxLength,
  maxImageSizeBytes,
  maxImagesPerWork,
  publicWorksPageSize,
} from '../shared/constants'
import type { WorkCard, WorkListResponse } from '../shared/types'
import { WorkCardList } from '../src/App'
import app from '../worker/index'
import { createTestBindings, testAdminPassword } from './test-env'

interface WorkFormOptions {
  description?: string
  edgeFinishes?: string[]
  grain?: string
  images?: File[]
  leatherColor?: string
  listingUrl?: string
  notes?: string
  removeImageIds?: string | number[]
  tanningMethod?: string
  threadColor?: string
  title?: string
}

function createImageFile(name: string, type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

function createOversizedImageFile(name: string, type = 'image/png'): File {
  return new File([new Uint8Array(maxImageSizeBytes + 1)], name, { type })
}

function createWorkForm(options: WorkFormOptions = {}): FormData {
  const formData = new FormData()

  formData.append('title', options.title ?? 'テスト作品')
  formData.append('leatherColor', options.leatherColor ?? 'キャメル')
  formData.append('grain', options.grain ?? 'なし')
  formData.append('threadColor', options.threadColor ?? '黒')
  formData.append('tanningMethod', options.tanningMethod ?? 'タンニン鞣し')
  formData.append('listingUrl', options.listingUrl ?? '')
  formData.append('description', options.description ?? '')
  formData.append('notes', options.notes ?? '')

  for (const edgeFinish of options.edgeFinishes ?? ['ヘリ落とし']) {
    formData.append('edgeFinishes', edgeFinish)
  }

  for (const image of options.images ?? []) {
    formData.append('images', image)
  }

  const removeImageIds = options.removeImageIds ?? []
  formData.append(
    'removeImageIds',
    typeof removeImageIds === 'string' ? removeImageIds : JSON.stringify(removeImageIds),
  )

  return formData
}

async function requestApp(
  path: string,
  init: RequestInit = {},
  env = createTestBindings(),
): Promise<Response> {
  const url = path.startsWith('http') ? path : `http://example.com${path}`
  return app.fetch(new Request(url, init), env)
}

function getRequestOrigin(path: string): string {
  const url = path.startsWith('http') ? path : `http://example.com${path}`
  return new URL(url).origin
}

function createAdminRequestHeaders(cookie?: string, path = '/api/admin/works'): HeadersInit {
  return cookie
    ? {
        cookie,
        origin: getRequestOrigin(path),
      }
    : {
        origin: getRequestOrigin(path),
      }
}

function getCookieHeader(response: Response): string {
  const setCookie = response.headers.get('set-cookie')

  if (!setCookie) {
    throw new Error('set-cookie header was not returned.')
  }

  return setCookie.split(';', 1)[0] ?? ''
}

async function loginAsAdmin(
  env = createTestBindings(),
  options: {
    ip?: string
    password?: string
    url?: string
  } = {},
): Promise<Response> {
  return requestApp(
    options.url ?? '/api/admin/session',
    {
      method: 'POST',
      headers: {
        'cf-connecting-ip': options.ip ?? '198.51.100.10',
        'content-type': 'application/json',
        origin: getRequestOrigin(options.url ?? '/api/admin/session'),
      },
      body: JSON.stringify({
        password: options.password ?? testAdminPassword,
      }),
    },
    env,
  )
}

describe('security tests', () => {
  it('stores SQL injection payload as text without breaking the works table', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)
    const payload = `sample'); DROP TABLE works; --`

    const createResponse = await requestApp(
      '/api/admin/works',
      {
        method: 'POST',
        headers: createAdminRequestHeaders(cookie),
        body: createWorkForm({
          description: payload,
          listingUrl: 'https://jp.mercari.com/item/m00000000000',
          notes: payload,
          title: payload,
        }),
      },
      env,
    )

    expect(createResponse.status).toBe(201)

    const createdWork = (await createResponse.json()) as {
      description: string
      listingUrl: string
      notes: string
      title: string
    }

    expect(createdWork.title).toBe(payload)
    expect(createdWork.description).toBe(payload)
    expect(createdWork.notes).toBe(payload)
    expect(createdWork.listingUrl).toBe('https://jp.mercari.com/item/m00000000000')

    const listResponse = await requestApp('/api/works', {}, env)
    const workList = (await listResponse.json()) as WorkListResponse

    expect(listResponse.status).toBe(200)
    expect(workList.works).toHaveLength(1)
    expect(workList.works[0]?.title).toBe(payload)
    expect(workList.works[0]?.description).toBe(payload)
    expect(workList.works[0]?.listingUrl).toBe('https://jp.mercari.com/item/m00000000000')
  })

  it('returns paginated public work list responses', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)

    for (let index = 0; index < publicWorksPageSize + 2; index += 1) {
      const createResponse = await requestApp(
        '/api/admin/works',
        {
          method: 'POST',
          headers: createAdminRequestHeaders(cookie),
          body: createWorkForm({
            title: `作品 ${index + 1}`,
          }),
        },
        env,
      )

      expect(createResponse.status).toBe(201)
    }

    const pageTwoResponse = await requestApp('/api/works?page=2', {}, env)
    const pageTwo = (await pageTwoResponse.json()) as WorkListResponse

    expect(pageTwoResponse.status).toBe(200)
    expect(pageTwo.page).toBe(2)
    expect(pageTwo.pageSize).toBe(publicWorksPageSize)
    expect(pageTwo.totalCount).toBe(publicWorksPageSize + 2)
    expect(pageTwo.totalPages).toBe(2)
    expect(pageTwo.works).toHaveLength(2)

    const clampedResponse = await requestApp('/api/works?page=999', {}, env)
    const clamped = (await clampedResponse.json()) as WorkListResponse

    expect(clamped.page).toBe(2)
  })

  it('escapes XSS payloads when rendering work cards', () => {
    const maliciousWork: WorkCard = {
      id: 1,
      title: '<img src=x onerror=alert(1)>',
      leatherColor: 'ブラック',
      grain: 'なし',
      threadColor: '黒',
      edgeFinishes: ['ヘリ落とし'],
      tanningMethod: 'タンニン鞣し',
      listingUrl: '',
      description: '<script>alert("xss")</script>',
      notes: 'not-rendered-on-list',
      coverImageUrl: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
      reactionCounts: {
        like: 0,
        request: 0,
      },
    }

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkCardList works={[maliciousWork]} />
      </MemoryRouter>,
    )

    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('詳細')
    expect(html).not.toContain('ブラック')
    expect(html).not.toContain('なし')
    expect(html).not.toContain('ヘリ関係なし')
    expect(html).not.toContain('not-rendered-on-list')
  })

  it('rejects invalid master selections on the server side', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)

    const response = await requestApp(
      '/api/admin/works',
      {
        method: 'POST',
        headers: createAdminRequestHeaders(cookie),
        body: createWorkForm({
          leatherColor: '未登録カラー',
        }),
      },
      env,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: '革の色 の選択が不正です。',
    })
  })

  it('rejects malformed uploads and identifiers on the server side', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)

    const invalidCases = [
      {
        expectedMessage: 'JPEG / PNG / WebP 画像のみアップロードできます。',
        formData: createWorkForm({
          images: [new File(['not an image'], 'attack.txt', { type: 'text/plain' })],
        }),
      },
      {
        expectedMessage: '出品リンクは http または https の URL を入力してください。',
        formData: createWorkForm({
          listingUrl: 'javascript:alert(1)',
        }),
      },
      {
        expectedMessage: `画像は 1 枚あたり ${(maxImageSizeBytes / 1024 / 1024).toFixed(0)}MB 以下にしてください。`,
        formData: createWorkForm({
          images: [createOversizedImageFile('too-large.png')],
        }),
      },
      {
        expectedMessage: `画像は ${maxImagesPerWork} 枚までです。`,
        formData: createWorkForm({
          images: Array.from({ length: maxImagesPerWork + 1 }, (_, index) =>
            createImageFile(`image-${index + 1}.png`),
          ),
        }),
      },
      {
        expectedMessage: '削除対象画像の指定が不正です。',
        formData: createWorkForm({
          removeImageIds: 'not-json',
        }),
      },
    ]

    for (const invalidCase of invalidCases) {
      const response = await requestApp(
        '/api/admin/works',
        {
          method: 'POST',
          headers: createAdminRequestHeaders(cookie),
          body: invalidCase.formData,
        },
        env,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: invalidCase.expectedMessage,
      })
    }
  })

  it('blocks login attempts after five failures from the same IP address', async () => {
    const env = createTestBindings()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await loginAsAdmin(env, {
        ip: '203.0.113.5',
        password: 'wrong-password',
      })

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: 'パスワードが間違っています。',
      })
    }

    const blockedResponse = await loginAsAdmin(env, {
      ip: '203.0.113.5',
      password: 'wrong-password',
    })

    expect(blockedResponse.status).toBe(429)
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: 'ログイン試行回数の上限に達しました。時間をおいて再試行してください。',
    })

    const differentIpResponse = await loginAsAdmin(env, {
      ip: '203.0.113.6',
      password: 'wrong-password',
    })

    expect(differentIpResponse.status).toBe(401)
  })

  it('rejects admin login passwords longer than fifty characters', async () => {
    const env = createTestBindings()
    const response = await loginAsAdmin(env, {
      password: 'a'.repeat(adminPasswordMaxLength + 1),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: `パスワードは ${adminPasswordMaxLength} 文字以内で入力してください。`,
    })
  })

  it('rejects cross-origin admin write requests', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)

    const response = await requestApp(
      '/api/admin/works',
      {
        method: 'POST',
        headers: {
          cookie,
          origin: 'https://attacker.example',
        },
        body: createWorkForm(),
      },
      env,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: '不正な送信元からのリクエストです。',
    })
  })

  it('requires admin authentication and returns defensive response headers', async () => {
    const env = createTestBindings()
    const publicResponse = await requestApp('/api/works', {}, env)

    expect(publicResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(publicResponse.headers.get('X-Frame-Options')).toBe('DENY')
    expect(publicResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(publicResponse.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    )
    expect(publicResponse.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')

    const unauthorizedAdminResponse = await requestApp('/api/admin/overview', {}, env)

    expect(unauthorizedAdminResponse.status).toBe(401)
    expect(unauthorizedAdminResponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('sets secure cookie attributes on successful admin login', async () => {
    const env = createTestBindings()
    const response = await loginAsAdmin(env, {
      url: 'https://example.com/api/admin/session',
    })

    expect(response.status).toBe(200)

    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Secure')
  })

  it('invalidates the admin session on logout', async () => {
    const env = createTestBindings()
    const loginResponse = await loginAsAdmin(env)
    const cookie = getCookieHeader(loginResponse)

    const beforeLogout = await requestApp(
      '/api/admin/overview',
      {
        headers: {
          cookie,
        },
      },
      env,
    )

    expect(beforeLogout.status).toBe(200)

    const logoutResponse = await requestApp(
      '/api/admin/session',
      {
        method: 'DELETE',
        headers: createAdminRequestHeaders(cookie, '/api/admin/session'),
      },
      env,
    )

    expect(logoutResponse.status).toBe(200)

    const afterLogout = await requestApp(
      '/api/admin/overview',
      {
        headers: {
          cookie,
        },
      },
      env,
    )

    expect(afterLogout.status).toBe(401)
  })
})
