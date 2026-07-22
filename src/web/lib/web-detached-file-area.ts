import {
  normalizeDetachedFileAreaWindowRequest,
  type DetachedFileAreaWindowRequest,
  type OpenDetachedFileAreaWindowResult,
} from '#/shared/file-area.ts'

const HANDOFF_QUERY_PARAM = 'handoff'
const HANDOFF_STORAGE_PREFIX = 'hobgoblin:detached-file-area:'
const HANDOFF_MAX_AGE_MS = 60_000
const HANDOFF_ID_PATTERN = /^[A-Za-z0-9-]{16,128}$/

interface StoredWebDetachedFileAreaHandoff {
  createdAt: number
  request: DetachedFileAreaWindowRequest
}

export function openWebDetachedFileAreaWindow(input: DetachedFileAreaWindowRequest): OpenDetachedFileAreaWindowResult {
  const request = normalizeDetachedFileAreaWindowRequest(input)
  if (!request) return { ok: false, message: 'error.invalid-input' }

  let handoffId: string
  try {
    handoffId = createHandoffId()
    window.sessionStorage.setItem(
      storageKey(handoffId),
      JSON.stringify({ createdAt: Date.now(), request } satisfies StoredWebDetachedFileAreaHandoff),
    )
  } catch {
    return { ok: false, message: 'error.failed-open-window' }
  }

  const targetUrl = new URL('/detached/file-area', window.location.href)
  targetUrl.searchParams.set(HANDOFF_QUERY_PARAM, handoffId)
  const features = popupFeatures(request)
  let popup: Window | null = null
  try {
    popup = window.open('about:blank', '_blank', features)
    if (!popup) throw new Error('Popup blocked')
    popup.opener = null
    popup.location.replace(targetUrl.toString())
  } catch {
    removeStoredHandoff(handoffId)
    try {
      popup?.close()
    } catch {}
    return { ok: false, message: 'error.failed-open-window' }
  }

  window.setTimeout(() => removeStoredHandoff(handoffId), HANDOFF_MAX_AGE_MS)
  return { ok: true, windowKey: `web-detached-file-area:${handoffId}` }
}

export function consumeWebDetachedFileAreaWindowHandoff(): DetachedFileAreaWindowRequest | null {
  let handoffId: string | null = null
  try {
    handoffId = new URL(window.location.href).searchParams.get(HANDOFF_QUERY_PARAM)
  } catch {
    return null
  }
  if (!handoffId || !HANDOFF_ID_PATTERN.test(handoffId)) return null

  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(storageKey(handoffId))
  } catch {
    return null
  } finally {
    removeCopiedHandoffs()
  }
  if (!raw) return null

  try {
    const stored = JSON.parse(raw) as Partial<StoredWebDetachedFileAreaHandoff>
    const age = Date.now() - Number(stored.createdAt)
    if (!Number.isFinite(age) || age < 0 || age > HANDOFF_MAX_AGE_MS) return null
    return normalizeDetachedFileAreaWindowRequest(stored.request)
  } catch {
    return null
  }
}

function createHandoffId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function storageKey(handoffId: string): string {
  return `${HANDOFF_STORAGE_PREFIX}${handoffId}`
}

function removeStoredHandoff(handoffId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(handoffId))
  } catch {}
}

function removeCopiedHandoffs(): void {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(HANDOFF_STORAGE_PREFIX)) window.sessionStorage.removeItem(key)
    }
  } catch {}
}

function popupFeatures(request: DetachedFileAreaWindowRequest): string {
  const position = request.releasePoint ? `,left=${request.releasePoint.x - 80},top=${request.releasePoint.y - 18}` : ''
  return `popup,width=960,height=720${position}`
}
