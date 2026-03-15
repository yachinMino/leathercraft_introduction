import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import type { AppBindings } from '../worker/types'

const migrationFiles = [
  new URL('../migrations/0001_initial.sql', import.meta.url),
  new URL('../migrations/0002_admin_login_attempts.sql', import.meta.url),
  new URL('../migrations/0003_work_listing_url.sql', import.meta.url),
  new URL('../migrations/0004_admin_sessions.sql', import.meta.url),
  new URL('../migrations/0005_work_description.sql', import.meta.url),
]

interface StoredObject {
  body: Uint8Array
  contentType: string | undefined
}

class MockD1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...params: unknown[]): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.database, this.sql, params)
  }

  async first<T>(): Promise<T | null> {
    const rows = this.database.prepare(this.sql).all(...this.params)
    return (rows[0] as T | undefined) ?? null
  }

  async all<T>(): Promise<{ results: T[] }> {
    const results = this.database.prepare(this.sql).all(...this.params) as T[]
    return { results }
  }

  async run(): Promise<{
    success: true
    meta: {
      changes: number
      duration: number
      last_row_id: number
      served_by: string
    }
  }> {
    const result = this.database.prepare(this.sql).run(...this.params)

    return {
      success: true,
      meta: {
        changes: Number(result.changes ?? 0),
        duration: 0,
        last_row_id: Number(result.lastInsertRowid ?? 0),
        served_by: 'vitest-mock',
      },
    }
  }
}

class MockD1Database {
  private readonly database = new DatabaseSync(':memory:')

  exec(sql: string): void {
    this.database.exec(sql)
  }

  prepare(sql: string): D1PreparedStatement {
    return new MockD1PreparedStatement(this.database, sql) as unknown as D1PreparedStatement
  }

  async batch(statements: readonly D1PreparedStatement[]): Promise<unknown[]> {
    const results: unknown[] = []

    this.database.exec('BEGIN')

    try {
      for (const statement of statements) {
        results.push(await (statement as unknown as MockD1PreparedStatement).run())
      }

      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

class MockR2Object {
  constructor(
    private readonly key: string,
    private readonly object: StoredObject,
  ) {}

  get body(): ReadableStream {
    return new Response(this.object.body).body as ReadableStream
  }

  get httpEtag(): string {
    return `"${this.key}"`
  }

  writeHttpMetadata(headers: Headers): void {
    if (this.object.contentType) {
      headers.set('content-type', this.object.contentType)
    }
  }
}

class MockR2Bucket {
  private readonly objects = new Map<string, StoredObject>()

  async put(
    key: string,
    value: BodyInit | null,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    const body =
      value === null
        ? new Uint8Array()
        : new Uint8Array(await new Response(value).arrayBuffer())

    this.objects.set(key, {
      body,
      contentType: options?.httpMetadata?.contentType,
    })
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key)

    if (!object) {
      return null
    }

    return new MockR2Object(key, object) as unknown as R2ObjectBody
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }
}

export const testAdminPassword = 'test-admin-password'

export function createTestBindings(overrides: Partial<AppBindings> = {}): AppBindings {
  const database = new MockD1Database()

  for (const migrationFile of migrationFiles) {
    database.exec(readFileSync(migrationFile, 'utf8'))
  }

  return {
    DB: database as unknown as D1Database,
    WORK_IMAGES: new MockR2Bucket() as unknown as R2Bucket,
    ADMIN_PASSWORD: testAdminPassword,
    SESSION_SECRET: 'test-session-secret',
    ...overrides,
  }
}
