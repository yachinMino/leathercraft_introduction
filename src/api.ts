import type {
  AdminOverviewResponse,
  AdminSessionResponse,
  MasterCatalog,
  ReactionResponse,
  WorkDetail,
  WorkListResponse,
} from '../shared/types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T
  }

  const payload = (await response.json().catch(() => null)) as { error?: string } | null
  throw new ApiError(payload?.error ?? '通信に失敗しました。', response.status)
}

export const api = {
  listWorks(page = 1) {
    return fetch(`/api/works?page=${page}`).then((response) => readJson<WorkListResponse>(response))
  },
  getWork(workId: number) {
    return fetch(`/api/works/${workId}`).then((response) => readJson<WorkDetail>(response))
  },
  react(workId: number, type: 'like' | 'request') {
    return fetch(`/api/works/${workId}/reactions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type }),
    }).then((response) => readJson<ReactionResponse>(response))
  },
  getAdminSession() {
    return fetch('/api/admin/session').then((response) => readJson<AdminSessionResponse>(response))
  },
  login(password: string) {
    return fetch('/api/admin/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password }),
    }).then((response) => readJson<AdminSessionResponse>(response))
  },
  logout() {
    return fetch('/api/admin/session', {
      method: 'DELETE',
    }).then((response) => readJson<AdminSessionResponse>(response))
  },
  getAdminOverview() {
    return fetch('/api/admin/overview').then((response) => readJson<AdminOverviewResponse>(response))
  },
  getAdminWork(workId: number) {
    return fetch(`/api/admin/works/${workId}`).then((response) => readJson<WorkDetail>(response))
  },
  createWork(formData: FormData) {
    return fetch('/api/admin/works', {
      method: 'POST',
      body: formData,
    }).then((response) => readJson<WorkDetail>(response))
  },
  updateWork(workId: number, formData: FormData) {
    return fetch(`/api/admin/works/${workId}`, {
      method: 'PUT',
      body: formData,
    }).then((response) => readJson<WorkDetail>(response))
  },
  deleteWork(workId: number) {
    return fetch(`/api/admin/works/${workId}`, {
      method: 'DELETE',
    }).then((response) => readJson<{ success: boolean }>(response))
  },
  saveMasters(catalog: MasterCatalog) {
    return fetch('/api/admin/masters', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(catalog),
    }).then((response) => readJson<MasterCatalog>(response))
  },
}
