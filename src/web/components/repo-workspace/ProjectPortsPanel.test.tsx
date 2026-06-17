// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocks = vi.hoisted(() => ({
  listPortForwardSessions: vi.fn(),
  startPortForwardSession: vi.fn(),
  stopPortForwardSession: vi.fn(),
  openExternalUrl: vi.fn(),
}))

vi.mock('#/web/port-forwarding-client.ts', () => ({
  listPortForwardSessions: mocks.listPortForwardSessions,
  startPortForwardSession: mocks.startPortForwardSession,
  stopPortForwardSession: mocks.stopPortForwardSession,
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  openExternalUrl: mocks.openExternalUrl,
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [] })
  mocks.startPortForwardSession.mockResolvedValue({
    ok: true,
    session: activeSession(),
  })
  mocks.stopPortForwardSession.mockResolvedValue({
    ok: true,
    session: { ...activeSession(), status: 'stopped' },
  })
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  })
  useReposStore.setState({
    repos: {},
    order: [],
    activeId: null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('ProjectPortsPanel', () => {
  test('shows a local-repo empty state', async () => {
    seedRepo('/repo')
    const { container, root } = await render('/repo')
    expect(container.textContent).toContain('ports.local-only-title')
    expect(container.querySelector('input')).toBeNull()
    await act(async () => root.unmount())
  })

  test('renders remote form and loads sessions', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    expect(container.querySelector('input[name="localPort"]')).toBeTruthy()
    expect(container.querySelector('input[name="remotePort"]')).toBeTruthy()
    expect(container.querySelector('input[name="localBindHost"]')).toBeNull()
    expect(container.querySelector('input[name="remoteHost"]')).toBeNull()
    const lanSwitch = container.querySelector<HTMLElement>('[role="switch"]')
    expect(lanSwitch).toBeTruthy()
    expect(lanSwitch?.getAttribute('aria-label')).toBe('ports.allow-lan-access')
    expect(lanSwitch?.getAttribute('title')).toBe('ports.allow-lan-access')
    expect(container.textContent).toContain('ports.lan-short')
    expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo', expect.any(AbortSignal))
    await act(async () => root.unmount())
  })

  test('shows warning when LAN access is enabled', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    expect(container.textContent).not.toContain('ports.non-loopback-warning')
    await toggleLanAccess(container)
    expect(container.textContent).toContain('ports.non-loopback-warning')
    await act(async () => root.unmount())
  })

  test('defaults remote port from local port until remote port is edited', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')

    await fill(container, 'localPort', '3000')
    expect(inputValue(container, 'remotePort')).toBe('3000')

    await fill(container, 'remotePort', '5173')
    await fill(container, 'localPort', '4000')
    expect(inputValue(container, 'remotePort')).toBe('5173')

    await act(async () => root.unmount())
  })

  test('starts a port forward from form values', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    await fill(container, 'localPort', '3000')
    const startButton = container.querySelector<HTMLButtonElement>('[data-testid="ports-start"]')
    expect(startButton?.getAttribute('aria-label')).toBe('ports.start')
    expect(startButton?.getAttribute('title')).toBe('ports.start')
    expect(startButton?.textContent).not.toContain('ports.start')
    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await vi.waitFor(() => {
      expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
        {
          repoId: 'ssh-config://prod/srv/repo',
          localBindHost: '127.0.0.1',
          localPort: 3000,
          remoteHost: '127.0.0.1',
          remotePort: 3000,
        },
        expect.any(AbortSignal),
      )
    })
    await act(async () => root.unmount())
  })

  test('starts a port forward bound to all interfaces when LAN access is enabled', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    await fill(container, 'localPort', '3000')
    await fill(container, 'remotePort', '5173')
    await toggleLanAccess(container)
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="ports-start"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await vi.waitFor(() => {
      expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
        {
          repoId: 'ssh-config://prod/srv/repo',
          localBindHost: '0.0.0.0',
          localPort: 3000,
          remoteHost: '127.0.0.1',
          remotePort: 5173,
        },
        expect.any(AbortSignal),
      )
    })
    await act(async () => root.unmount())
  })

  test('renders session actions for active sessions', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [activeSession()] })
    const { container, root } = await render('ssh-config://prod/srv/repo')

    expect(container.textContent).toContain('127.0.0.1:61888')
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="ports-copy-pf_1"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://127.0.0.1:61888')
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="ports-open-pf_1"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:61888')
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="ports-stop-pf_1"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.stopPortForwardSession).toHaveBeenCalledWith('pf_1')
    await act(async () => root.unmount())
  })
})

async function render(repoId: string): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ProjectPortsPanel repoId={repoId} />)
  })
  return { container, root }
}

function seedRepo(repoId: string): void {
  useReposStore.setState({
    repos: { [repoId]: emptyRepo(repoId, repoId.includes('ssh-config://') ? 'prod:repo' : 'repo') },
    order: [repoId],
    activeId: repoId,
  })
}

async function fill(container: HTMLElement, name: string, value: string): Promise<void> {
  setInputValue(container, name, value)
}

function inputValue(container: HTMLElement, name: string): string {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!input) throw new Error(`missing ${name} input`)
  return input.value
}

async function toggleLanAccess(container: HTMLElement): Promise<void> {
  const toggle = container.querySelector<HTMLElement>('[role="switch"]')
  if (!toggle) throw new Error('missing LAN access switch')
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function setInputValue(container: HTMLElement, name: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!input) throw new Error(`missing ${name} input`)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function activeSession() {
  return {
    id: 'pf_1',
    repoId: 'ssh-config://prod/srv/repo',
    localBindHost: '127.0.0.1',
    requestedLocalPort: 3000,
    actualLocalPort: 61888,
    remoteHost: 'localhost',
    remotePort: 3000,
    status: 'active' as const,
    localUrl: 'http://127.0.0.1:61888',
    createdAt: '2026-06-15T12:00:00.000Z',
    updatedAt: '2026-06-15T12:00:01.000Z',
  }
}
