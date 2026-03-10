import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom'

import { ApiError, api } from './api'
import {
  adminPasswordMaxLength,
  allowedUploadImageTypes,
  masterCategoryLabels,
  masterCategoryOrder,
  maxImageSizeBytes,
  maxImagesPerWork,
  reactionTypeLabels,
} from '../shared/constants'
import type {
  AdminOverviewResponse,
  MasterCatalog,
  MasterCategory,
  ReactionType,
  WorkCard,
  WorkDetail,
  WorkListResponse,
} from '../shared/types'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value))
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return '処理に失敗しました。'
}

function cloneCatalog(catalog: MasterCatalog): MasterCatalog {
  return {
    leatherColor: [...catalog.leatherColor],
    grain: [...catalog.grain],
    threadColor: [...catalog.threadColor],
    edgeFinish: [...catalog.edgeFinish],
    tanningMethod: [...catalog.tanningMethod],
  }
}

function mergeOptionList(options: string[], currentValue?: string): string[] {
  if (!currentValue || options.includes(currentValue)) {
    return options
  }

  return [currentValue, ...options]
}

function mergeCatalogWithWork(catalog: MasterCatalog, work?: WorkDetail | null): MasterCatalog {
  if (!work) {
    return cloneCatalog(catalog)
  }

  return {
    leatherColor: mergeOptionList(catalog.leatherColor, work.leatherColor),
    grain: mergeOptionList(catalog.grain, work.grain),
    threadColor: mergeOptionList(catalog.threadColor, work.threadColor),
    edgeFinish: Array.from(new Set([...catalog.edgeFinish, ...work.edgeFinishes])),
    tanningMethod: mergeOptionList(catalog.tanningMethod, work.tanningMethod),
  }
}

function createWorkDraft(masters: MasterCatalog, work: WorkDetail | null) {
  const resolvedCatalog = mergeCatalogWithWork(masters, work)

  return {
    title: work?.title ?? '',
    leatherColor: work?.leatherColor ?? resolvedCatalog.leatherColor[0] ?? '',
    grain: work?.grain ?? resolvedCatalog.grain[0] ?? '',
    threadColor: work?.threadColor ?? resolvedCatalog.threadColor[0] ?? '',
    tanningMethod: work?.tanningMethod ?? resolvedCatalog.tanningMethod[0] ?? '',
    listingUrl: work?.listingUrl ?? '',
    notes: work?.notes ?? '',
    edgeFinishes: work?.edgeFinishes ?? [],
  }
}

type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis'

function parsePageParam(value: string | null): number {
  const page = Number(value)

  if (!Number.isInteger(page) || page <= 0) {
    return 1
  }

  return page
}

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: PaginationItem[] = [1]
  const startPage = Math.max(2, currentPage - 1)
  const endPage = Math.min(totalPages - 1, currentPage + 1)

  if (startPage > 2) {
    items.push('start-ellipsis')
  }

  for (let page = startPage; page <= endPage; page += 1) {
    items.push(page)
  }

  if (endPage < totalPages - 1) {
    items.push('end-ellipsis')
  }

  items.push(totalPages)

  return items
}

interface AppShellProps {
  children: React.ReactNode
  adminAuthenticated: boolean
  logoutBusy: boolean
  onLogout: () => Promise<void>
}

function AppShell({ children, adminAuthenticated, logoutBusy, onLogout }: AppShellProps) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="site-mark" to="/">
          <span className="site-mark__name">Leather Works Journal</span>
        </Link>
        <nav className="site-nav">
          <NavLink to="/about">このサイトについて</NavLink>
          <NavLink to="/" end>
            作品一覧
          </NavLink>
          <NavLink to="/admin">管理画面</NavLink>
          {adminAuthenticated ? (
            <button
              className="site-nav__button"
              disabled={logoutBusy}
              onClick={() => {
                void onLogout()
              }}
              type="button"
            >
              {logoutBusy ? 'ログアウト中...' : 'ログアウト'}
            </button>
          ) : null}
        </nav>
      </header>
      <main className="site-main">{children}</main>
    </div>
  )
}

function LoadingBlock({ label = '読み込み中です。' }: { label?: string }) {
  return (
    <div className="state-card">
      <p>{label}</p>
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="state-card state-card--error">
      <p>{message}</p>
    </div>
  )
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="state-card">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function AboutPage() {
  return (
    <div className="page-stack">
      <section className="detail-hero">
        <div className="detail-hero__copy">
          <p className="eyebrow">About</p>
          <h1>このサイトについて</h1>
          <p>Leather Works Journal の位置づけをまとめています。</p>
        </div>
      </section>

      <section className="about-card">
        <p>
          Leather Works Journal は、作者が制作したレザークラフト作品を記録し、整理して残していくためのサイトです。
        </p>
        <ul className="about-list">
          <li>作者の記録用サイトですので、閲覧のみを目的にしています。</li>
          <li>リクエストボタンはこれまで作ったものを再度作成するかどうかの目安になります。</li>
          <li>オーダー作品は受け付けておりません。</li>
        </ul>
        <p>
          作成したものはメルカリで出品しています（
          <a
            className="text-link"
            href="https://jp.mercari.com/user/profile/585762627"
            rel="noreferrer"
            target="_blank"
          >
            リンク
          </a>
          ）
        </p>
        <ul className="about-list">
          <li>
            ブログ：
            <a
              className="text-link"
              href="https://rakyooooo.hatenablog.com/"
              rel="noreferrer"
              target="_blank"
            >
              https://rakyooooo.hatenablog.com/
            </a>
          </li>
          <li>
            X：
            <a
              className="text-link"
              href="https://x.com/yukichika_co"
              rel="noreferrer"
              target="_blank"
            >
              https://x.com/yukichika_co
            </a>
          </li>
          <li>
            メール：
            <a className="text-link" href="mailto:yukichika_co@yahoo.co.jp">
              yukichika_co@yahoo.co.jp
            </a>
          </li>
        </ul>
      </section>
    </div>
  )
}

export function WorkCardList({ works }: { works: WorkCard[] }) {
  if (works.length === 0) {
    return (
      <EmptyBlock
        title="まだ作品がありません"
        body="管理画面から作品を登録すると、ここに一覧表示されます。"
      />
    )
  }

  return (
    <section className="work-grid">
      {works.map((work) => (
        <article className="work-card" key={work.id}>
          <Link className="work-card__image" to={`/works/${work.id}`}>
            {work.coverImageUrl ? (
              <img alt={work.title} src={work.coverImageUrl} />
            ) : (
              <div className="work-card__placeholder">No Image</div>
            )}
          </Link>
          <div className="work-card__body">
            <div className="work-card__heading">
              <h2>{work.title}</h2>
              <span>{formatDate(work.updatedAt)}</span>
            </div>
            <div className="tag-list">
              <span>{work.leatherColor}</span>
              <span>{work.grain}</span>
              <span>{work.threadColor}</span>
              <span>{work.tanningMethod}</span>
            </div>
            {work.edgeFinishes.length > 0 ? (
              <p className="work-card__notes">ヘリ: {work.edgeFinishes.join(' / ')}</p>
            ) : null}
            {work.notes ? <p className="work-card__notes">{work.notes}</p> : null}
            <div className="reaction-strip">
              <span>いいね {work.reactionCounts.like}</span>
              <span>リクエスト {work.reactionCounts.request}</span>
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}

function PaginationNav({
  page,
  totalCount,
  totalPages,
  onPageChange,
}: {
  page: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const items = buildPaginationItems(page, totalPages)

  return (
    <nav aria-label="作品一覧のページ送り" className="pagination">
      <p className="pagination__summary">
        {totalCount} 件中 {page} / {totalPages} ページ
      </p>
      <div className="pagination__controls">
        <button
          className="pagination__button pagination__button--nav"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          前へ
        </button>
        <div className="pagination__list">
          {items.map((item) =>
            typeof item === 'number' ? (
              <button
                aria-current={item === page ? 'page' : undefined}
                className={`pagination__button ${item === page ? 'is-active' : ''}`}
                key={item}
                onClick={() => onPageChange(item)}
                type="button"
              >
                {item}
              </button>
            ) : (
              <span className="pagination__ellipsis" key={item}>
                …
              </span>
            ),
          )}
        </div>
        <button
          className="pagination__button pagination__button--nav"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          次へ
        </button>
      </div>
    </nav>
  )
}

function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [workList, setWorkList] = useState<WorkListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentPage = parsePageParam(searchParams.get('page'))
  const rawPage = searchParams.get('page')

  function setPage(nextPage: number, replace = false) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)

        if (nextPage <= 1) {
          next.delete('page')
        } else {
          next.set('page', String(nextPage))
        }

        return next
      },
      { replace },
    )
  }

  useEffect(() => {
    let cancelled = false

    setLoading(true)

    async function loadWorks() {
      try {
        const nextWorkList = await api.listWorks(currentPage)

        if (!cancelled) {
          setWorkList(nextWorkList)
          setError(null)

          if (rawPage !== null && String(nextWorkList.page) !== rawPage) {
            setSearchParams(
              (current) => {
                const next = new URLSearchParams(current)

                if (nextWorkList.page <= 1) {
                  next.delete('page')
                } else {
                  next.set('page', String(nextWorkList.page))
                }

                return next
              },
              { replace: true },
            )
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadWorks()

    return () => {
      cancelled = true
    }
  }, [currentPage, rawPage, setSearchParams])

  return (
    <div className="page-stack">
      {loading ? <LoadingBlock label="作品一覧を読み込んでいます。" /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      {!loading && !error && workList ? <WorkCardList works={workList.works} /> : null}
      {!loading && !error && workList && workList.totalPages > 1 ? (
        <PaginationNav
          onPageChange={(page) => {
            setPage(page)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          page={workList.page}
          totalCount={workList.totalCount}
          totalPages={workList.totalPages}
        />
      ) : null}
    </div>
  )
}

function WorkDetailPage() {
  const params = useParams()
  const [work, setWork] = useState<WorkDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reactionBusy, setReactionBusy] = useState<ReactionType | null>(null)

  useEffect(() => {
    const workId = Number(params.id)

    if (!Number.isInteger(workId) || workId <= 0) {
      setError('作品 ID が不正です。')
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadWork() {
      try {
        const nextWork = await api.getWork(workId)

        if (!cancelled) {
          setWork(nextWork)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadWork()

    return () => {
      cancelled = true
    }
  }, [params.id])

  async function handleReaction(type: ReactionType) {
    if (!work || work.viewerReactions[type]) {
      return
    }

    setReactionBusy(type)

    try {
      const response = await api.react(work.id, type)
      setWork({
        ...work,
        reactionCounts: response.reactionCounts,
        viewerReactions: response.viewerReactions,
      })
      setError(null)
    } catch (nextError) {
      setError(getErrorMessage(nextError))
    } finally {
      setReactionBusy(null)
    }
  }

  if (loading) {
    return <LoadingBlock label="作品詳細を読み込んでいます。" />
  }

  if (error) {
    return <ErrorBlock message={error} />
  }

  if (!work) {
    return <EmptyBlock title="作品が見つかりません" body="一覧から別の作品を選んでください。" />
  }

  return (
    <div className="page-stack">
      <section className="detail-hero">
        <div className="detail-hero__copy">
          <p className="eyebrow">Detail</p>
          <h1>{work.title}</h1>
          <p>更新日: {formatDate(work.updatedAt)}</p>
        </div>
        <Link className="text-link" to="/">
          一覧へ戻る
        </Link>
      </section>

      <section className="detail-grid">
        <div className="detail-gallery">
          {work.images.length > 0 ? (
            work.images.map((image) => (
              <figure className="detail-gallery__item" key={image.id}>
                <img alt={image.filename || work.title} src={image.url} />
              </figure>
            ))
          ) : (
            <div className="detail-gallery__empty">画像はまだ登録されていません。</div>
          )}
        </div>

        <aside className="detail-panel">
          <dl className="detail-specs">
            <div>
              <dt>革の色</dt>
              <dd>{work.leatherColor}</dd>
            </div>
            <div>
              <dt>シボ</dt>
              <dd>{work.grain}</dd>
            </div>
            <div>
              <dt>糸の色</dt>
              <dd>{work.threadColor}</dd>
            </div>
            <div>
              <dt>ヘリの処理</dt>
              <dd>{work.edgeFinishes.length > 0 ? work.edgeFinishes.join(' / ') : '未設定'}</dd>
            </div>
            <div>
              <dt>鞣し方</dt>
              <dd>{work.tanningMethod}</dd>
            </div>
            <div>
              <dt>出品リンク</dt>
              <dd>
                {work.listingUrl ? (
                  <a className="text-link" href={work.listingUrl} rel="noreferrer" target="_blank">
                    リンクを開く
                  </a>
                ) : (
                  'なし'
                )}
              </dd>
            </div>
            <div>
              <dt>備考</dt>
              <dd>{work.notes || '記載なし'}</dd>
            </div>
          </dl>

          <div className="reaction-panel">
            {(['like', 'request'] as const).map((type) => (
              <button
                className={`reaction-button ${work.viewerReactions[type] ? 'is-active' : ''}`}
                disabled={Boolean(reactionBusy) || work.viewerReactions[type]}
                key={type}
                onClick={() => {
                  void handleReaction(type)
                }}
                type="button"
              >
                <span>{reactionTypeLabels[type]}</span>
                <strong>{work.reactionCounts[type]}</strong>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </div>
  )
}

interface WorkFormPanelProps {
  masters: MasterCatalog
  work: WorkDetail | null
  busy: boolean
  deleting: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onDelete: (workId: number) => Promise<void>
}

function WorkFormPanel({ masters, work, busy, deleting, onSubmit, onDelete }: WorkFormPanelProps) {
  const resolvedCatalog = mergeCatalogWithWork(masters, work)
  const initialDraft = createWorkDraft(masters, work)
  const [title, setTitle] = useState(initialDraft.title)
  const [leatherColor, setLeatherColor] = useState(initialDraft.leatherColor)
  const [grain, setGrain] = useState(initialDraft.grain)
  const [threadColor, setThreadColor] = useState(initialDraft.threadColor)
  const [tanningMethod, setTanningMethod] = useState(initialDraft.tanningMethod)
  const [listingUrl, setListingUrl] = useState(initialDraft.listingUrl)
  const [notes, setNotes] = useState(initialDraft.notes)
  const [edgeFinishes, setEdgeFinishes] = useState<string[]>(initialDraft.edgeFinishes)
  const [newImages, setNewImages] = useState<File[]>([])
  const [removeImageIds, setRemoveImageIds] = useState<number[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputId = work ? `image-input-${work.id}` : 'image-input-new'

  const currentImageCount = (work?.images.length ?? 0) - removeImageIds.length + newImages.length

  function toggleEdgeFinish(value: string) {
    setEdgeFinishes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  function toggleImageRemoval(imageId: number) {
    setRemoveImageIds((current) =>
      current.includes(imageId) ? current.filter((item) => item !== imageId) : [...current, imageId],
    )
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    const invalidTypeFile = selectedFiles.find(
      (file) => !allowedUploadImageTypes.includes(file.type as (typeof allowedUploadImageTypes)[number]),
    )
    const oversizedFile = selectedFiles.find((file) => file.size > maxImageSizeBytes)
    const keepSlots = maxImagesPerWork - ((work?.images.length ?? 0) - removeImageIds.length)

    if (invalidTypeFile) {
      setLocalError('JPEG / PNG / WebP 画像のみアップロードできます。')
      setNewImages([])
      event.target.value = ''
      return
    }

    if (oversizedFile) {
      setLocalError(`画像は 1 枚あたり ${(maxImageSizeBytes / 1024 / 1024).toFixed(0)}MB 以下にしてください。`)
      setNewImages([])
      event.target.value = ''
      return
    }

    if (selectedFiles.length > keepSlots) {
      setLocalError(`画像は合計 ${maxImagesPerWork} 枚までです。`)
      setNewImages(selectedFiles.slice(0, Math.max(keepSlots, 0)))
      return
    }

    setLocalError(null)
    setNewImages(selectedFiles)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (currentImageCount > maxImagesPerWork) {
      setLocalError(`画像は合計 ${maxImagesPerWork} 枚までです。`)
      return
    }

    const formData = new FormData()
    formData.append('title', title)
    formData.append('leatherColor', leatherColor)
    formData.append('grain', grain)
    formData.append('threadColor', threadColor)
    formData.append('tanningMethod', tanningMethod)
    formData.append('listingUrl', listingUrl)
    formData.append('notes', notes)

    for (const edgeFinish of Array.from(new Set(edgeFinishes))) {
      formData.append('edgeFinishes', edgeFinish)
    }

    for (const image of newImages) {
      formData.append('images', image)
    }

    formData.append('removeImageIds', JSON.stringify(removeImageIds))

    setLocalError(null)
    await onSubmit(formData)
  }

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div>
          <p className="eyebrow">Works</p>
          <h2>{work ? '作品を編集' : '新しい作品を登録'}</h2>
        </div>
        {work ? (
          <button
            className="ghost-button"
            disabled={busy || deleting}
            onClick={() => {
              void onDelete(work.id)
            }}
            type="button"
          >
            作品を削除
          </button>
        ) : null}
      </div>

      <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          <span>作品名</span>
          <input onChange={(event) => setTitle(event.target.value)} required value={title} />
        </label>

        <div className="admin-form__grid">
          <label>
            <span>革の色</span>
            <select onChange={(event) => setLeatherColor(event.target.value)} value={leatherColor}>
              {resolvedCatalog.leatherColor.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>シボ</span>
            <select onChange={(event) => setGrain(event.target.value)} value={grain}>
              {resolvedCatalog.grain.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>糸の色</span>
            <select onChange={(event) => setThreadColor(event.target.value)} value={threadColor}>
              {resolvedCatalog.threadColor.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>鞣し方</span>
            <select onChange={(event) => setTanningMethod(event.target.value)} value={tanningMethod}>
              {resolvedCatalog.tanningMethod.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="check-grid">
          <legend>ヘリの処理</legend>
          {resolvedCatalog.edgeFinish.map((option) => (
            <label className="check-item" key={option}>
              <input
                checked={edgeFinishes.includes(option)}
                onChange={() => toggleEdgeFinish(option)}
                type="checkbox"
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>

        <label>
          <span>備考</span>
          <textarea onChange={(event) => setNotes(event.target.value)} rows={5} value={notes} />
        </label>

        <label>
          <span>出品リンク</span>
          <input
            inputMode="url"
            maxLength={500}
            onChange={(event) => setListingUrl(event.target.value)}
            placeholder="https://..."
            type="url"
            value={listingUrl}
          />
        </label>

        <div className="image-editor">
          <div className="image-editor__header">
            <span>画像アップロード</span>
            <small>
              合計 {currentImageCount}/{maxImagesPerWork} 枚
            </small>
          </div>

          {work?.images.length ? (
            <div className="image-editor__existing">
              {work.images.map((image) => {
                const markedForRemoval = removeImageIds.includes(image.id)

                return (
                  <label className={`image-thumb ${markedForRemoval ? 'is-muted' : ''}`} key={image.id}>
                    <img alt={image.filename} src={image.url} />
                    <span>{image.filename}</span>
                    <input
                      checked={markedForRemoval}
                      onChange={() => toggleImageRemoval(image.id)}
                      type="checkbox"
                    />
                    <small>削除対象</small>
                  </label>
                )
              })}
            </div>
          ) : null}

          <label className="file-input" htmlFor={fileInputId}>
            <span>追加する画像を選択</span>
            <input
              accept={allowedUploadImageTypes.join(',')}
              id={fileInputId}
              multiple
              onChange={handleFileChange}
              type="file"
            />
          </label>

          {newImages.length > 0 ? (
            <ul className="file-list">
              {newImages.map((file) => (
                <li key={`${file.name}-${file.size}`}>{file.name}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {localError ? <p className="status-text status-text--error">{localError}</p> : null}

        <div className="admin-form__actions">
          <button disabled={busy || deleting} type="submit">
            {busy ? '保存中...' : work ? '作品を更新' : '作品を登録'}
          </button>
        </div>
      </form>
    </section>
  )
}

interface MasterEditorProps {
  masters: MasterCatalog
  busy: boolean
  onSave: (catalog: MasterCatalog) => Promise<void>
}

function MasterEditor({ masters, busy, onSave }: MasterEditorProps) {
  const [draft, setDraft] = useState<MasterCatalog>(cloneCatalog(masters))

  useEffect(() => {
    setDraft(cloneCatalog(masters))
  }, [masters])

  function updateItem(category: MasterCategory, index: number, value: string) {
    setDraft((current) => {
      const next = cloneCatalog(current)
      next[category][index] = value
      return next
    })
  }

  function addItem(category: MasterCategory) {
    setDraft((current) => {
      const next = cloneCatalog(current)
      next[category] = [...next[category], '']
      return next
    })
  }

  function removeItem(category: MasterCategory, index: number) {
    setDraft((current) => {
      const next = cloneCatalog(current)
      next[category] = next[category].filter((_, itemIndex) => itemIndex !== index)
      return next
    })
  }

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div>
          <p className="eyebrow">Masters</p>
          <h2>マスタ編集</h2>
        </div>
      </div>

      <div className="master-stack">
        {masterCategoryOrder.map((category) => (
          <section className="master-section" key={category}>
            <div className="master-section__header">
              <h3>{masterCategoryLabels[category]}</h3>
              <button
                className="ghost-button"
                onClick={() => addItem(category)}
                type="button"
              >
                項目を追加
              </button>
            </div>
            <div className="master-section__list">
              {draft[category].map((value, index) => (
                <div className="master-row" key={`${category}-${index}`}>
                  <input
                    onChange={(event) => updateItem(category, index, event.target.value)}
                    placeholder={`${masterCategoryLabels[category]} を入力`}
                    value={value}
                  />
                  <button
                    className="ghost-button"
                    disabled={draft[category].length <= 1}
                    onClick={() => removeItem(category, index)}
                    type="button"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="admin-form__actions">
        <button
          disabled={busy}
          onClick={() => {
            void onSave(draft)
          }}
          type="button"
        >
          {busy ? '保存中...' : 'マスタを保存'}
        </button>
      </div>
    </section>
  )
}

interface AdminPageProps {
  adminAuthenticated: boolean
  authReady: boolean
  onAuthChange: (authenticated: boolean) => void
}

function AdminPage({ adminAuthenticated, authReady, onAuthChange }: AdminPageProps) {
  const [password, setPassword] = useState('')
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [selectedWork, setSelectedWork] = useState<WorkDetail | null>(null)
  const [activePanel, setActivePanel] = useState<'works' | 'masters'>('works')
  const [loadingWork, setLoadingWork] = useState(false)
  const [workBusy, setWorkBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [masterBusy, setMasterBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)

  const handleAdminError = useCallback((nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      setOverview(null)
      setSelectedWork(null)
      onAuthChange(false)
      setError('管理画面にログインしてください。')
      return
    }

    setError(getErrorMessage(nextError))
  }, [onAuthChange])

  async function loadOverview(selectedId?: number | null) {
    const nextOverview = await api.getAdminOverview()
    setOverview(nextOverview)

    if (selectedId) {
      try {
        const nextWork = await api.getAdminWork(selectedId)
        setSelectedWork(nextWork)
      } catch {
        setSelectedWork(null)
      }
    } else {
      setSelectedWork(null)
    }
  }

  useEffect(() => {
    if (!authReady) {
      return
    }

    if (!adminAuthenticated) {
      setOverview(null)
      setSelectedWork(null)
      setLoadingWork(false)
      return
    }

    if (overview) {
      return
    }

    let cancelled = false

    async function bootstrapAdminData() {
      try {
        await loadOverview()
      } catch (nextError) {
        if (!cancelled) {
          handleAdminError(nextError)
        }
      }
    }

    void bootstrapAdminData()

    return () => {
      cancelled = true
    }
  }, [adminAuthenticated, authReady, handleAdminError, overview])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      const session = await api.login(password)
      onAuthChange(session.authenticated)
      setPassword('')
    } catch (nextError) {
      setError(getErrorMessage(nextError))
      return
    }

    try {
      await loadOverview()
    } catch (nextError) {
      handleAdminError(nextError)
    }
  }

  async function handleEdit(workId: number) {
    setLoadingWork(true)
    setError(null)

    try {
      const work = await api.getAdminWork(workId)
      setSelectedWork(work)
      setActivePanel('works')
      setEditorRevision((current) => current + 1)
    } catch (nextError) {
      handleAdminError(nextError)
    } finally {
      setLoadingWork(false)
    }
  }

  async function handleSaveWork(formData: FormData) {
    setWorkBusy(true)
    setError(null)
    setNotice(null)

    try {
      const editingWork = selectedWork
      const savedWork = editingWork
        ? await api.updateWork(selectedWork.id, formData)
        : await api.createWork(formData)

      if (editingWork) {
        await loadOverview(savedWork.id)
        setSelectedWork(savedWork)
      } else {
        await loadOverview()
        setSelectedWork(null)
        setActivePanel('works')
      }

      setEditorRevision((current) => current + 1)
      setNotice(editingWork ? '作品を更新しました。' : '作品を登録しました。')
    } catch (nextError) {
      handleAdminError(nextError)
    } finally {
      setWorkBusy(false)
    }
  }

  async function handleDelete(workId: number) {
    if (!window.confirm('この作品を削除します。よろしいですか。')) {
      return
    }

    setDeleteBusy(true)
    setError(null)
    setNotice(null)

    try {
      await api.deleteWork(workId)
      await loadOverview()
      setSelectedWork(null)
      setEditorRevision((current) => current + 1)
      setNotice('作品を削除しました。')
    } catch (nextError) {
      handleAdminError(nextError)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleSaveMasters(catalog: MasterCatalog) {
    setMasterBusy(true)
    setError(null)
    setNotice(null)

    try {
      const savedMasters = await api.saveMasters(catalog)
      setOverview((current) => (current ? { ...current, masters: savedMasters } : current))
      setNotice('マスタを更新しました。')
    } catch (nextError) {
      handleAdminError(nextError)
    } finally {
      setMasterBusy(false)
    }
  }

  if (!authReady) {
    return <LoadingBlock label="管理画面を準備しています。" />
  }

  if (!adminAuthenticated) {
    return (
      <section className="admin-auth">
        <div className="admin-auth__panel">
          <p className="eyebrow">Admin Access</p>
          <h1>管理画面ログイン</h1>
          <p>作品登録とマスタ編集は、設定した管理者パスワードで操作します。</p>
          <form className="admin-auth__form" onSubmit={(event) => void handleLogin(event)}>
            <label>
              <span>パスワード</span>
              <input
                maxLength={adminPasswordMaxLength}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button type="submit">ログイン</button>
          </form>
          {error ? <p className="status-text status-text--error">{error}</p> : null}
          {notice ? <p className="status-text">{notice}</p> : null}
        </div>
      </section>
    )
  }

  if (!overview) {
    return error ? <ErrorBlock message={error} /> : <LoadingBlock label="管理データを読み込んでいます。" />
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__top">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>管理画面</h1>
          </div>
        </div>

        <div className="tab-strip">
          <button
            className={activePanel === 'works' ? 'is-active' : ''}
            onClick={() => {
              setSelectedWork(null)
              setActivePanel('works')
              setEditorRevision((current) => current + 1)
              setNotice(null)
            }}
            type="button"
          >
            作品登録
          </button>
          <button
            className={activePanel === 'masters' ? 'is-active' : ''}
            onClick={() => setActivePanel('masters')}
            type="button"
          >
            マスタ編集
          </button>
        </div>

        <div className="admin-sidebar__list">
          {overview.works.length === 0 ? (
            <p className="admin-sidebar__empty">作品はまだありません。</p>
          ) : (
            overview.works.map((work) => (
              <button
                className={`work-list-item ${selectedWork?.id === work.id ? 'is-selected' : ''}`}
                key={work.id}
                onClick={() => {
                  void handleEdit(work.id)
                }}
                type="button"
              >
                <strong>{work.title}</strong>
                <span>{work.leatherColor}</span>
                <small>{formatDate(work.updatedAt)}</small>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="admin-content">
        {loadingWork ? <LoadingBlock label="作品データを読み込んでいます。" /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {notice ? <p className="status-text">{notice}</p> : null}

        {activePanel === 'works' ? (
          <WorkFormPanel
            busy={workBusy}
            deleting={deleteBusy}
            key={selectedWork ? `${selectedWork.id}-${editorRevision}` : `new-${editorRevision}`}
            masters={overview.masters}
            onDelete={handleDelete}
            onSubmit={handleSaveWork}
            work={selectedWork}
          />
        ) : (
          <MasterEditor busy={masterBusy} masters={overview.masters} onSave={handleSaveMasters} />
        )}
      </div>
    </div>
  )
}

function NotFoundPage() {
  return (
    <EmptyBlock
      body="指定したページは見つかりませんでした。"
      title="ページがありません"
    />
  )
}

export default function App() {
  const [authReady, setAuthReady] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrapSession() {
      try {
        const session = await api.getAdminSession()

        if (!cancelled) {
          setAdminAuthenticated(session.authenticated)
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true)
        }
      }
    }

    void bootstrapSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleHeaderLogout() {
    setLogoutBusy(true)

    try {
      await api.logout()
      setAdminAuthenticated(false)
    } finally {
      setLogoutBusy(false)
    }
  }

  return (
    <BrowserRouter>
      <AppShell
        adminAuthenticated={adminAuthenticated}
        logoutBusy={logoutBusy}
        onLogout={handleHeaderLogout}
      >
        <Routes>
          <Route element={<AboutPage />} path="/about" />
          <Route element={<HomePage />} path="/" />
          <Route element={<WorkDetailPage />} path="/works/:id" />
          <Route
            element={
              <AdminPage
                adminAuthenticated={adminAuthenticated}
                authReady={authReady}
                onAuthChange={setAdminAuthenticated}
              />
            }
            path="/admin"
          />
          <Route element={<NotFoundPage />} path="*" />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
