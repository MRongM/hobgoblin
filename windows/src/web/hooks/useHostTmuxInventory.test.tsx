// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useHostTmuxInventory } from '#/web/hooks/useHostTmuxInventory.tsx'

const mocks = vi.hoisted(() => ({
  hostPlatform: 'linux',
  preview: vi.fn(),
  close: vi.fn(),
  open: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: mocks.hostPlatform }),
}))
vi.mock('#/web/tmux-cleanup-client.ts', () => ({
  previewHostTmuxSessions: mocks.preview,
  closeHostTmuxSessions: mocks.close,
  openHostTmuxSession: mocks.open,
}))
vi.mock('sonner', () => ({
  toast: { info: mocks.toastInfo, success: mocks.toastSuccess, error: mocks.toastError },
}))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}))

let container: HTMLDivElement
let root: Root
beforeEach(async () => {
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
  document.body.querySelectorAll('[data-slot="dialog-portal"]').forEach((portal) => portal.remove())
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useHostTmuxInventory', () => {
  test('hides local Windows inventory but keeps SSH host inventory visible', () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    mocks.hostPlatform = 'win32'
    renderHarness('/work/repo')
    expect(container.querySelector('[data-testid="host-inventory-action"]')).toBeNull()

    renderHarness('ssh-config://prod/srv/repo')
    expect(container.querySelector('[data-testid="host-inventory-action"]')).not.toBeNull()
  })

  test('reports empty and failed scans without opening the inventory dialog', async () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    mocks.preview
      .mockResolvedValueOnce({ ok: true, sessions: [] })
      .mockResolvedValueOnce({ ok: false, message: 'error.tmux-unavailable' })
    renderHarness('/work/repo')

    await click('[data-testid="host-inventory-action"]')
    expect(mocks.preview).toHaveBeenCalledWith({ projectRoot: '/work/repo' })
    expect(mocks.toastInfo).toHaveBeenCalledWith('tmux.host-inventory.none')
    expect(document.body.querySelector('[data-testid="host-tmux-dialog"]')).toBeNull()

    await click('[data-testid="host-inventory-action"]')
    expect(mocks.toastError).toHaveBeenCalledWith('tmux.host-inventory.preview-failed', {
      description: 'error.tmux-unavailable',
    })
  })

  test('groups sessions by directory and keeps every destructive selection unchecked', async () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    mocks.preview.mockResolvedValue({ ok: true, sessions: inventorySessions() })
    renderHarness('/work/repo')

    await click('[data-testid="host-inventory-action"]')

    expect(document.body.querySelectorAll('[data-host-tmux-directory]')).toHaveLength(2)
    expect(document.body.textContent).toContain('/work/feature')
    expect(document.body.textContent).toContain('/other/worktree')
    expect(document.body.textContent).toContain('hobgoblin-v1-0123456789abcdef01234567')
    expect(document.body.textContent).toContain('tmux.host-inventory.attached:2')
    expect(document.body.textContent).toContain('tmux.host-inventory.detached')
    expect(document.body.textContent).toContain('tmux.host-inventory.default-session')
    expect(document.body.textContent).not.toContain('tmux.host-inventory.terminal-number:undefined')
    expect(document.body.textContent).toContain('tmux.host-inventory.warning')
    expect(document.body.textContent).not.toContain('tmux.host-inventory.project-root')
    const checkboxes = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-host-tmux-session]'))
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes.every((checkbox) => checkbox.dataset.state === 'unchecked')).toBe(true)
    expect(closeButton()?.disabled).toBe(true)
  })

  test('closes exact selected origins, removes completed rows, and retains failures', async () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    const sessions = inventorySessions()
    mocks.preview.mockResolvedValue({ ok: true, sessions })
    mocks.close.mockResolvedValue({
      ok: true,
      closed: [sessions[0]],
      missing: [{ kind: 'default', sessionName: sessions[1]!.sessionName }],
      failed: [{ session: sessions[2], message: 'permission denied' }],
    })
    renderHarness('/work/repo')
    await click('[data-testid="host-inventory-action"]')

    const checkboxes = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-host-tmux-session]'))
    act(() => {
      for (const checkbox of checkboxes) checkbox.click()
    })
    expect(closeButton()?.disabled).toBe(false)
    expect(closeButton()?.textContent).toContain('tmux.host-inventory.close-selected:3')
    await click('[data-host-tmux-close-selected]')

    expect(mocks.close).toHaveBeenCalledWith({
      projectRoot: '/work/repo',
      approvedSessions: [
        { kind: 'hobgoblin', sessionName: sessions[0]!.sessionName, serverName: sessions[0]!.serverName },
        { kind: 'default', sessionName: sessions[1]!.sessionName },
        { kind: 'hobgoblin', sessionName: sessions[2]!.sessionName, serverName: sessions[2]!.serverName },
      ],
    })
    expect(document.body.textContent).not.toContain(sessions[0]!.sessionName)
    expect(document.body.textContent).not.toContain(sessions[1]!.sessionName)
    expect(document.body.textContent).toContain(sessions[2]!.sessionName)
    expect(document.body.querySelector<HTMLButtonElement>('[data-host-tmux-session]')?.dataset.state).toBe('unchecked')
    expect(mocks.toastError).toHaveBeenCalledWith('tmux.host-inventory.partial:1,1,1', {
      description: `${sessions[2]!.sessionName}: permission denied`,
    })
  })

  test('opens one exact scanned session externally without selecting it for close', async () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    const sessions = inventorySessions()
    mocks.preview.mockResolvedValue({ ok: true, sessions })
    mocks.open.mockResolvedValueOnce({ ok: true, status: 'opened' }).mockResolvedValueOnce({
      ok: true,
      status: 'missing',
    })
    renderHarness('/work/repo')
    await click('[data-testid="host-inventory-action"]')

    const openButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-host-tmux-open-session]'))
    expect(openButtons).toHaveLength(3)
    await act(async () => {
      openButtons[1]!.click()
      await Promise.resolve()
    })

    expect(mocks.open).toHaveBeenCalledWith({
      projectRoot: '/work/repo',
      session: { kind: 'default', sessionName: sessions[1]!.sessionName },
    })
    const checkboxes = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-host-tmux-session]'))
    expect(checkboxes[1]?.dataset.state).toBe('unchecked')
    expect(mocks.toastError).not.toHaveBeenCalled()

    await act(async () => {
      openButtons[1]!.click()
      await Promise.resolve()
    })
    expect(mocks.toastError).toHaveBeenCalledWith('tmux.host-inventory.open-missing')
  })

  test('ignores duplicate scan triggers while the first request is pending', async () => {
    expect(useHostTmuxInventory).toBeTypeOf('function')
    if (!useHostTmuxInventory) return
    let resolvePreview: ((result: { ok: true; sessions: [] }) => void) | undefined
    mocks.preview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve
      }),
    )
    renderHarness('/work/repo')

    await click('[data-testid="host-inventory-action"]')
    await click('[data-testid="host-inventory-action"]')
    expect(mocks.preview).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolvePreview?.({ ok: true, sessions: [] })
      await Promise.resolve()
    })
  })
})

function renderHarness(projectRoot: string): void {
  act(() => root.render(<Harness projectRoot={projectRoot} />))
}

function Harness({ projectRoot }: { projectRoot: string }) {
  if (!useHostTmuxInventory) return null
  const inventory = useHostTmuxInventory({ projectRoot })
  return (
    <>
      {inventory.visible ? (
        <button
          data-testid="host-inventory-action"
          disabled={inventory.contextAction.disabled}
          onClick={inventory.contextAction.onSelect}
        />
      ) : null}
      {inventory.dialog}
    </>
  )
}

function inventorySessions() {
  return [
    {
      kind: 'hobgoblin' as const,
      sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
      initialPath: '/work/feature',
      terminalNumber: 1,
      attachedClients: 2,
      serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
    },
    {
      kind: 'default' as const,
      sessionName: 'editor work',
      initialPath: '/work/feature',
      attachedClients: 0,
    },
    {
      kind: 'hobgoblin' as const,
      sessionName: 'hobgoblin-v1-fedcba9876543210fedcba98',
      initialPath: '/other/worktree',
      terminalNumber: 3,
      attachedClients: 0,
      serverName: 'hobgoblin-project-v1-fedcba9876543210fedcba98',
    },
  ]
}

function closeButton(): HTMLButtonElement | null {
  return document.body.querySelector('[data-host-tmux-close-selected]')
}

async function click(selector: string): Promise<void> {
  await act(async () => {
    const target = document.body.querySelector<HTMLButtonElement>(selector) ?? container.querySelector(selector)
    target?.click()
    await Promise.resolve()
  })
}
