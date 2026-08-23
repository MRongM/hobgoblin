// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ExternalAppSettings } from '#/web/components/settings/pages/ExternalAppSettings.tsx'

const controller = vi.hoisted(() => ({
  refreshExternalApps: vi.fn(),
  setTerminalApp: vi.fn(),
  setEditorApp: vi.fn(),
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: 'win32' }),
}))

vi.mock('#/web/settings-queries.ts', () => ({
  useExternalAppsQuery: () => ({
    data: {
      terminal: {
        pref: 'auto',
        resolved: 'wsl',
        available: true,
        appAvailability: { ghostty: false, terminal: true, wsl: true, powershell: true, cmd: true },
        detectedAt: 1,
      },
      editor: {
        pref: 'auto',
        resolved: 'vscode',
        available: true,
        appAvailability: { vscode: true, cursor: false, windsurf: false },
        detectedAt: 1,
      },
    },
  }),
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useExternalAppSettingsController: () => ({ ...controller, refreshing: false }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  controller.refreshExternalApps.mockReset()
  controller.setTerminalApp.mockReset()
  controller.setEditorApp.mockReset()
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
})

test('shows and writes the Windows external terminal shell choices', async () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<ExternalAppSettings />)
    await Promise.resolve()
  })

  expect(document.body.textContent).toContain('settings.terminal.windows-external')
  expect(document.body.textContent).toContain('settings.apps.tool.wsl.title')
  expect(document.body.textContent).toContain('settings.apps.tool.powershell.title')
  expect(document.body.textContent).toContain('settings.apps.tool.cmd.title')
  expect(document.body.textContent).not.toContain('settings.apps.tool.ghostty.title')

  const trigger = document.getElementById('settings-terminal')
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('Missing Windows external terminal select')
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })

  const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
  expect(options.map((option) => option.textContent?.trim())).toEqual([
    'settings.terminal.auto-windows',
    'settings.terminal.wsl',
    'settings.terminal.powershell',
    'settings.terminal.cmd',
  ])

  const powershell = options.find((option) => option.textContent?.trim() === 'settings.terminal.powershell')
  if (!powershell) throw new Error('Missing PowerShell option')
  await act(async () => {
    powershell.click()
    await Promise.resolve()
  })

  expect(controller.setTerminalApp).toHaveBeenCalledWith('powershell')
})
