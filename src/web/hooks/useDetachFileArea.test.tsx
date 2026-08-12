// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, test, vi } from 'vitest'
import { useDetachFileArea } from '#/web/hooks/useDetachFileArea.ts'

const mocks = vi.hoisted(() => ({ enabled: true, open: vi.fn(async () => ({ ok: true as const, windowKey: 'one' })) }))

vi.mock('#/web/app-shell-client.ts', () => ({
  canOpenDetachedFileAreaWindow: () => mocks.enabled,
  openDetachedFileAreaWindow: mocks.open,
}))

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

test('opens the captured file area after an outside release', async () => {
  mocks.open.mockClear()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function Harness() {
    const detach = useDetachFileArea({ kind: 'plain-project', repo: { kind: 'local', id: '/plain' }, tab: 'files' })
    return <button {...detach.bindings}>files</button>
  }
  await act(async () => root.render(<Harness />))
  const button = container.querySelector('button')!
  const event = new Event('dragend', { bubbles: true })
  Object.defineProperties(event, {
    clientX: { value: -1 },
    clientY: { value: 20 },
    screenX: { value: 900 },
    screenY: { value: 400 },
  })
  await act(async () => button.dispatchEvent(event))
  expect(mocks.open).toHaveBeenCalledWith({
    kind: 'plain-project',
    repo: { kind: 'local', id: '/plain' },
    tab: 'files',
    releasePoint: { x: 900, y: 400 },
  })
  await act(async () => root.unmount())
  container.remove()
})

test('keeps the active tab captured when the toolbar drag starts', async () => {
  mocks.open.mockClear()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function Harness() {
    const [tab, setTab] = useState<'files' | 'changes'>('files')
    const detach = useDetachFileArea({
      kind: 'git-worktree',
      repo: { kind: 'local', id: '/repo' },
      branch: 'main',
      tab,
    })
    return (
      <>
        <button data-testid="toolbar" {...detach.bindings}>
          toolbar
        </button>
        <button data-testid="change-tab" onClick={() => setTab('changes')}>
          change tab
        </button>
      </>
    )
  }
  await act(async () => root.render(<Harness />))
  const toolbar = container.querySelector<HTMLButtonElement>('[data-testid="toolbar"]')!
  const dragStart = new Event('dragstart', { bubbles: true })
  Object.defineProperty(dragStart, 'dataTransfer', {
    value: { effectAllowed: '', setData: vi.fn() },
  })
  await act(async () => toolbar.dispatchEvent(dragStart))
  await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="change-tab"]')!.click())

  const dragEnd = new Event('dragend', { bubbles: true })
  Object.defineProperties(dragEnd, {
    clientX: { value: -1 },
    clientY: { value: 20 },
    screenX: { value: 900 },
    screenY: { value: 400 },
  })
  await act(async () => toolbar.dispatchEvent(dragEnd))

  expect(mocks.open).toHaveBeenCalledWith({
    kind: 'git-worktree',
    repo: { kind: 'local', id: '/repo' },
    branch: 'main',
    tab: 'files',
    releasePoint: { x: 900, y: 400 },
  })
  await act(async () => root.unmount())
  container.remove()
})
