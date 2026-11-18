// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { en, ja, ko, zh } from '#/shared/i18n/dictionaries.ts'
import { TerminalFilePreview } from '#/web/components/terminal/TerminalFilePreview.tsx'
import {
  readTerminalFilePreview,
  type TerminalFilePreviewReadResult,
  type TerminalFilePreviewTarget,
} from '#/web/components/terminal/terminal-file-preview.ts'

vi.mock('#/web/components/terminal/terminal-file-preview.ts', () => ({ readTerminalFilePreview: vi.fn() }))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) => {
    let value = en[key as keyof typeof en] ?? key
    for (const [name, replacement] of Object.entries(params ?? {}))
      value = value.replace(`{${name}}`, String(replacement))
    return value
  },
}))

const read = vi.mocked(readTerminalFilePreview)
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement
let root: Root | null
let onClose: ReturnType<typeof vi.fn<() => void>>
const scrollIntoView = vi.fn()
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

function target(path = 'src/example.ts', line?: number, column?: number): TerminalFilePreviewTarget {
  return {
    repoId: 'example-repo',
    worktreePath: '/workspace',
    target: { path, line, column },
    relativePath: path,
    kind: 'text',
  }
}

function textResult(content: string): TerminalFilePreviewReadResult {
  return { ok: true, kind: 'text', relativePath: 'src/example.ts', content, byteLength: content.length }
}

function deferred() {
  let resolve!: (result: TerminalFilePreviewReadResult) => void
  let reject!: (error: Error) => void
  const promise = new Promise<TerminalFilePreviewReadResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

async function render(previewTarget: TerminalFilePreviewTarget, compact = false) {
  await act(async () =>
    root!.render(<TerminalFilePreview target={previewTarget} onClose={onClose} compact={compact} />),
  )
}

beforeEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  read.mockReset()
  read.mockImplementation(() => new Promise(() => {}))
  scrollIntoView.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  onClose = vi.fn()
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  vi.restoreAllMocks()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TerminalFilePreview', () => {
  test('shows the file identity, line and column, close action, and loading state', async () => {
    await render(target('src/example.ts', 2, 4), true)
    expect(container.textContent).toContain('example.ts')
    expect(container.textContent).toContain('src/example.ts')
    expect(container.textContent).toContain('Line 2, column 4')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Loading preview…')
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Close preview')
    expect(
      container
        .querySelector('[data-terminal-file-preview]')
        ?.classList.contains('goblin-terminal-file-preview--compact'),
    ).toBe(true)
  })

  test('escapes HTML and Markdown source and reveals the referenced selectable text line', async () => {
    const content = '# Heading\n<script>alert("example")</script>\nlast'
    read.mockResolvedValue(textResult(content))
    await render(target('src/example.html', 2, 4))
    expect(container.querySelector('[data-preview-source]')?.textContent).toBe(content)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[data-preview-line="2"]')?.textContent).toBe('<script>alert("example")</script>')
    expect(container.querySelector('[data-preview-gutter]')?.textContent).toBe('1\n2\n3')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })
    expect(container.querySelector('textarea, [contenteditable]')).toBeNull()
  })

  test('handles empty text and out-of-range referenced lines', async () => {
    read.mockResolvedValue(textResult(''))
    await render(target('empty.txt', 20))
    expect(container.querySelector('[data-preview-source]')?.textContent).toBe('')
    expect(container.querySelector('[data-preview-gutter]')?.textContent).toBe('1')
    expect(container.querySelector('[data-preview-line]')).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  test('keeps DOM nodes bounded for a newline-heavy text file', async () => {
    read.mockResolvedValue(textResult('\n'.repeat(1024 * 1024)))
    await render(target('blank.txt', 100))
    expect(container.querySelectorAll('*').length).toBeLessThan(30)
    expect(container.querySelector('[data-preview-line="100"]')).not.toBeNull()
  })

  test.each([
    ['error.file-tree-text-file-too-large', 'File is too large to read as text.'],
    ['error.file-tree-binary-file', 'File is not plain text.'],
    ['error.file-tree-not-regular-file', 'Path is not a regular file.'],
    ['error.path-not-found', en['error.path-not-found']],
  ])('localizes a read failure: %s', async (message, expected) => {
    read.mockResolvedValue({ ok: false, kind: 'text', relativePath: 'example.txt', message })
    await render(target())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(expected)
    expect(container.querySelector('[data-preview-source], img')).toBeNull()
  })

  test('uses preview-specific copy for the existing image size error', async () => {
    read.mockResolvedValue({
      ok: false,
      kind: 'image',
      relativePath: 'large.png',
      message: 'error.file-tree-clipboard-file-too-large',
    })
    await render({ ...target('large.png'), kind: 'image' })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Image exceeds the 20 MiB preview size limit.')
  })

  test('shows a local generic error for thrown reads', async () => {
    read.mockRejectedValue(new Error('private transport details'))
    await render(target())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not read this file for preview.')
    expect(container.textContent).not.toContain('private transport details')
  })

  test.each([
    ['image.PNG', 'image/png'],
    ['image.jpg', 'image/jpeg'],
    ['image.jpeg', 'image/jpeg'],
    ['image.gif', 'image/gif'],
    ['image.webp', 'image/webp'],
    ['image.svg', 'image/svg+xml'],
    ['image.bmp', 'image/bmp'],
    ['image.ico', 'image/x-icon'],
    ['image.avif', 'image/avif'],
  ])('renders %s through an image data URL with a MIME fallback', async (path, mime) => {
    read.mockResolvedValue({
      ok: true,
      kind: 'image',
      relativePath: path,
      name: path,
      bytesBase64: 'YWJj',
      byteLength: 3,
    })
    await render({ ...target(path), kind: 'image' })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`data:${mime};base64,YWJj`)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe(path)
    expect(container.querySelector('svg, iframe, object, embed')).toBeNull()
  })

  test('shows an invalid-image error when browser decoding fails', async () => {
    read.mockResolvedValue({
      ok: true,
      kind: 'image',
      relativePath: 'image.png',
      name: 'image.png',
      mimeType: 'image/png',
      bytesBase64: 'YWJj',
      byteLength: 3,
    })
    await render({ ...target('image.png'), kind: 'image' })
    act(() => container.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('This image could not be displayed.')
    expect(container.querySelector('img')).toBeNull()
  })

  test('clears previous text while the next file is loading', async () => {
    read.mockResolvedValueOnce(textResult('previous content'))
    await render(target('a.txt'))
    await render(target('b.txt'))
    expect(container.textContent).not.toContain('previous content')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Loading preview…')
  })

  test('aborts replaced requests and ignores stale resolution after returning from B to A', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    const a = target('a.txt')
    await render(a)
    const firstSignal = read.mock.calls[0]![1]!
    await render(target('b.txt'))
    const secondSignal = read.mock.calls[1]![1]!
    await render(a)
    expect(firstSignal.aborted).toBe(true)
    expect(secondSignal.aborted).toBe(true)
    await act(async () => third.resolve(textResult('latest A')))
    await act(async () => {
      first.resolve(textResult('stale A'))
      second.resolve(textResult('stale B'))
    })
    expect(container.querySelector('[data-preview-source]')?.textContent).toBe('latest A')
  })

  test('ignores stale rejection without replacing the new result', async () => {
    const first = deferred()
    read.mockReturnValueOnce(first.promise).mockResolvedValueOnce(textResult('current'))
    await render(target('a.txt'))
    await render(target('b.txt'))
    await act(async () => first.reject(new Error('stale failure')))
    expect(container.querySelector('[data-preview-source]')?.textContent).toBe('current')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test('close aborts the read immediately and prevents a late result', async () => {
    const pending = deferred()
    read.mockReturnValue(pending.promise)
    await render(target())
    const signal = read.mock.calls[0]![1]!
    act(() => container.querySelector('button')!.click())
    expect(onClose).toHaveBeenCalledOnce()
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(textResult('late result')))
    expect(container.querySelector('[data-preview-source]')).toBeNull()
  })

  test('unmount aborts the read and tolerates its late completion', async () => {
    const pending = deferred()
    read.mockReturnValue(pending.promise)
    await render(target())
    const signal = read.mock.calls[0]![1]!
    act(() => {
      root!.unmount()
      root = null
    })
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(textResult('late result')))
    expect(container.textContent).toBe('')
  })

  test('has complete preview translations in all four locales', () => {
    const keys = [
      'title',
      'close',
      'loading',
      'unsupported',
      'invalid-image',
      'read-failed',
      'image-too-large',
      'line',
      'line-column',
    ]
    for (const dict of [en, zh, ja, ko]) {
      for (const key of keys) expect(dict[`terminal.file-preview.${key}` as keyof typeof dict]).toBeTruthy()
    }
  })
})
