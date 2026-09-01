// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { WindowsInternalTerminalShellSettings } from '#/web/components/settings/pages/WindowsInternalTerminalShellSettings.tsx'

const state = vi.hoisted(() => ({
  hostPlatform: 'win32' as NodeJS.Platform,
  preference: 'auto' as 'auto' | 'wsl' | 'powershell' | 'cmd',
  setWindowsInternalTerminalShell: vi.fn(),
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: state.hostPlatform }),
}))

vi.mock('#/web/runtime-settings-terminal-shell.ts', () => ({
  useRuntimeWindowsInternalTerminalShellSettings: () => ({
    windowsInternalTerminalShell: state.preference,
  }),
  useWindowsInternalTerminalShellController: () => ({
    setWindowsInternalTerminalShell: state.setWindowsInternalTerminalShell,
  }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.hostPlatform = 'win32'
  state.preference = 'auto'
  state.setWindowsInternalTerminalShell.mockReset()
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
})

test('shows and writes all Windows internal terminal shell choices in policy order', async () => {
  await renderSettings()

  expect(document.body.textContent).toContain('settings.windows-internal-terminal-shell.title')
  const trigger = document.getElementById('settings-windows-internal-terminal-shell')
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('Missing Windows internal terminal shell select')
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })

  const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
  expect(options.map((option) => option.textContent?.trim())).toEqual([
    'settings.windows-internal-terminal-shell.auto',
    'settings.windows-internal-terminal-shell.wsl',
    'settings.windows-internal-terminal-shell.powershell',
    'settings.windows-internal-terminal-shell.cmd',
  ])

  const powershell = options.find(
    (option) => option.textContent?.trim() === 'settings.windows-internal-terminal-shell.powershell',
  )
  if (!powershell) throw new Error('Missing PowerShell option')
  await act(async () => {
    powershell.click()
    await Promise.resolve()
  })

  expect(state.setWindowsInternalTerminalShell).toHaveBeenCalledWith('powershell')
})

test('does not render the Windows internal terminal shell setting on other hosts', async () => {
  state.hostPlatform = 'darwin'
  await renderSettings()

  expect(document.body.textContent).not.toContain('settings.windows-internal-terminal-shell.title')
  expect(document.getElementById('settings-windows-internal-terminal-shell')).toBeNull()
})

async function renderSettings(): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<WindowsInternalTerminalShellSettings />)
    await Promise.resolve()
  })
}
