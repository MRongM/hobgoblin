// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MacosComputerUsePermissionSettings } from '#/web/components/settings/pages/MacosComputerUsePermissionSettings.tsx'

const state = vi.hoisted(() => ({
  hostPlatform: 'darwin' as NodeJS.Platform,
  available: true,
}))

const client = vi.hoisted(() => ({
  getMacosComputerUsePermissions: vi.fn(),
  requestMacosComputerUsePermission: vi.fn(),
}))

const toastError = vi.hoisted(() => vi.fn())

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: state.hostPlatform }),
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  canManageMacosComputerUsePermissions: () => state.available,
  getMacosComputerUsePermissions: client.getMacosComputerUsePermissions,
  requestMacosComputerUsePermission: client.requestMacosComputerUsePermission,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { error: toastError },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  state.hostPlatform = 'darwin'
  state.available = true
  client.getMacosComputerUsePermissions.mockReset()
  client.requestMacosComputerUsePermission.mockReset()
  toastError.mockReset()
  client.getMacosComputerUsePermissions.mockResolvedValue({
    screenRecording: 'granted',
    accessibility: 'denied',
  })
  client.requestMacosComputerUsePermission.mockResolvedValue({
    ok: true,
    permissions: { screenRecording: 'granted', accessibility: 'granted' },
  })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
})

describe('MacosComputerUsePermissionSettings', () => {
  test('does not offer permission actions before the initial status is loaded', async () => {
    let resolvePermissions!: (permissions: { screenRecording: 'granted'; accessibility: 'denied' }) => void
    client.getMacosComputerUsePermissions.mockReturnValue(
      new Promise((resolve) => {
        resolvePermissions = resolve
      }),
    )

    await renderSettings()

    expect(document.body.querySelectorAll('button')).toHaveLength(0)

    await act(async () => {
      resolvePermissions({ screenRecording: 'granted', accessibility: 'denied' })
      await Promise.resolve()
    })
  })

  test('shows independent screen recording and accessibility statuses on macOS Electron', async () => {
    await renderSettings()

    expect(document.body.textContent).toContain('settings.macos-permissions.screen-recording')
    expect(document.body.textContent).toContain('settings.macos-permissions.accessibility')
    expect(document.body.textContent).toContain('settings.macos-permissions.status.granted')
    expect(document.body.textContent).toContain('settings.macos-permissions.status.denied')
  })

  test('requests only the selected permission', async () => {
    await renderSettings()

    await act(async () => {
      buttonByText('settings.macos-permissions.authorize').click()
      await Promise.resolve()
    })

    expect(client.requestMacosComputerUsePermission).toHaveBeenCalledWith('accessibility')
    expect(document.body.textContent).toContain('settings.macos-permissions.status.granted')
  })

  test('refreshes permission state when the window regains focus', async () => {
    await renderSettings()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(client.getMacosComputerUsePermissions).toHaveBeenCalledTimes(2)
  })

  test.each([
    ['win32' as NodeJS.Platform, true],
    ['darwin' as NodeJS.Platform, false],
  ])('stays hidden for platform %s when native availability is %s', async (hostPlatform, available) => {
    state.hostPlatform = hostPlatform
    state.available = available

    await renderSettings()

    expect(document.body.textContent).toBe('')
    expect(client.getMacosComputerUsePermissions).not.toHaveBeenCalled()
  })
})

async function renderSettings(): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<MacosComputerUsePermissionSettings />)
    await Promise.resolve()
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(document.body.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  )
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button with text: ${text}`)
  return match
}
