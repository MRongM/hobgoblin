// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hostPlatform: 'linux',
  preview: vi.fn(),
  cleanup: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: mocks.hostPlatform }),
}))
vi.mock('#/web/tmux-cleanup-client.ts', () => ({
  previewAssociatedTmuxSessions: mocks.preview,
  cleanupAssociatedTmuxSessions: mocks.cleanup,
}))
vi.mock('sonner', () => ({
  toast: { info: mocks.toastInfo, success: mocks.toastSuccess, error: mocks.toastError },
}))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}))
vi.mock('#/web/components/ConfirmDialog.tsx', () => ({
  ConfirmDialog: ({ open, message, onConfirm }: { open: boolean; message: React.ReactNode; onConfirm: () => void }) =>
    open ? (
      <div data-testid="confirm-dialog">
        {message}
        <button data-testid="confirm" onClick={onConfirm} />
      </div>
    ) : null,
}))

import { useAssociatedTmuxCleanup } from '#/web/hooks/useAssociatedTmuxCleanup.tsx'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mocks.hostPlatform = 'linux'
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useAssociatedTmuxCleanup', () => {
  test('hides local Windows cleanup but keeps SSH cleanup visible', () => {
    mocks.hostPlatform = 'win32'
    renderHarness('/work/repo')
    expect(container.querySelector('[data-testid="cleanup-action"]')).toBeNull()

    renderHarness('ssh-config://prod/srv/repo')
    expect(container.querySelector('[data-testid="cleanup-action"]')).not.toBeNull()
  })

  test('reports an empty preview without opening confirmation', async () => {
    mocks.preview.mockResolvedValue({ ok: true, targetPath: '/work/feature', sessions: [] })
    renderHarness('/work/repo')

    await click('[data-testid="cleanup-action"]')

    expect(mocks.preview).toHaveBeenCalledWith({ projectRoot: '/work/repo', itemPath: '/work/feature' })
    expect(mocks.toastInfo).toHaveBeenCalledWith('tmux.cleanup.none', { description: '/work/feature' })
    expect(container.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
  })

  test('reports preview failures separately from empty results', async () => {
    mocks.preview.mockResolvedValue({ ok: false, message: 'error.tmux-unavailable' })
    renderHarness('/work/repo')

    await click('[data-testid="cleanup-action"]')

    expect(mocks.toastError).toHaveBeenCalledWith('tmux.cleanup.preview-failed', {
      description: 'error.tmux-unavailable',
    })
    expect(mocks.toastInfo).not.toHaveBeenCalled()
  })

  test('confirms listed session names and executes only previewed ids', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      targetPath: '/work/feature',
      sessions: [
        {
          sessionId: '$1',
          sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
          sessionPath: '/work/feature',
        },
      ],
    })
    mocks.cleanup.mockResolvedValue({
      ok: true,
      targetPath: '/work/feature',
      deleted: [
        {
          sessionId: '$1',
          sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
          sessionPath: '/work/feature',
        },
      ],
      missingSessionIds: [],
      failed: [],
    })
    renderHarness('/work/repo')

    await click('[data-testid="cleanup-action"]')
    expect(container.textContent).toContain('/work/feature')
    expect(container.textContent).toContain('hobgoblin-v1-0123456789abcdef01234567')
    await click('[data-testid="confirm"]')

    expect(mocks.cleanup).toHaveBeenCalledWith({
      projectRoot: '/work/repo',
      itemPath: '/work/feature',
      approvedSessionIds: ['$1'],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('tmux.cleanup.success:1')
  })

  test('reports partial deletion details without rolling back successful sessions', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      targetPath: '/work/feature',
      sessions: [
        { sessionId: '$1', sessionName: 'hobgoblin-v1-0123456789abcdef01234567', sessionPath: '/work/feature' },
        { sessionId: '$2', sessionName: 'hobgoblin-v1-89abcdef0123456789abcdef', sessionPath: '/work/feature' },
      ],
    })
    mocks.cleanup.mockResolvedValue({
      ok: true,
      targetPath: '/work/feature',
      deleted: [
        { sessionId: '$1', sessionName: 'hobgoblin-v1-0123456789abcdef01234567', sessionPath: '/work/feature' },
      ],
      missingSessionIds: [],
      failed: [{ sessionId: '$2', sessionName: 'hobgoblin-v1-89abcdef0123456789abcdef', message: 'denied' }],
    })
    renderHarness('/work/repo')

    await click('[data-testid="cleanup-action"]')
    await click('[data-testid="confirm"]')

    expect(mocks.toastError).toHaveBeenCalledWith('tmux.cleanup.partial:1,1,0', {
      description: 'hobgoblin-v1-89abcdef0123456789abcdef: denied',
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})

function renderHarness(projectRoot: string): void {
  act(() => {
    root.render(<Harness projectRoot={projectRoot} />)
  })
}

function Harness({ projectRoot }: { projectRoot: string }) {
  const cleanup = useAssociatedTmuxCleanup({ projectRoot, itemPath: '/work/feature' })
  return (
    <>
      {cleanup.visible ? (
        <button data-testid="cleanup-action" disabled={cleanup.action.disabled} onClick={cleanup.action.onSelect} />
      ) : null}
      {cleanup.dialog}
    </>
  )
}

async function click(selector: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(selector)?.click()
    await Promise.resolve()
  })
}
