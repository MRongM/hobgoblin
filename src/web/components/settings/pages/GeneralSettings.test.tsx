// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneralSettings } from '#/web/components/settings/pages/GeneralSettings.tsx'

const mocks = vi.hoisted(() => ({
  openAppConfigEditor: vi.fn(),
  toastError: vi.fn(),
}))

let editorAvailable = true

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}))

vi.mock('#/web/settings-client.ts', () => ({
  openAppConfigEditor: mocks.openAppConfigEditor,
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: () => ({ editorAvailable }),
}))

vi.mock('#/web/runtime-settings-general.ts', () => ({
  useRuntimeGeneralSettings: () => ({
    terminalThemeSyncEnabled: true,
    temporaryFilesDirectory: '',
    serverPort: 32100,
  }),
  useGeneralSettingsController: () => ({
    setTerminalThemeSyncEnabled: vi.fn(),
    setTemporaryFilesDirectory: vi.fn(),
    setServerPort: vi.fn(),
  }),
}))

vi.mock('#/web/runtime-settings-fonts.ts', () => ({
  useRuntimeFontSettings: () => ({ appFontSize: 14, fontFamily: 'mono' }),
  useFontSettingsController: () => ({ setAppFontSize: vi.fn(), setFontFamily: vi.fn() }),
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 34, toolbarHeightPx: 34 }),
  useChromeSettingsController: () => ({ setTopbarHeightPx: vi.fn(), setToolbarHeightPx: vi.fn() }),
}))

vi.mock('#/web/stores/theme.ts', () => ({
  useThemeStore: (selector: (state: { pref: 'auto'; colorTheme: 'default'; setPref: () => void; setColorTheme: () => void }) => unknown) =>
    selector({ pref: 'auto', colorTheme: 'default', setPref: vi.fn(), setColorTheme: vi.fn() }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
  useI18nStore: (selector: (state: { pref: 'auto'; setPref: () => void }) => unknown) =>
    selector({ pref: 'auto', setPref: vi.fn() }),
}))

let container: HTMLDivElement
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  editorAvailable = true
  vi.clearAllMocks()
  mocks.openAppConfigEditor.mockResolvedValue({ ok: true, message: '' })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  root = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('GeneralSettings', () => {
  test('opens the app configuration directory once through the selected editor', async () => {
    let resolveOpen: ((value: { ok: boolean; message: string }) => void) | null = null
    mocks.openAppConfigEditor.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve
      }),
    )
    await render()

    const button = buttonByText('settings.general.open-app-config-action')
    await act(async () => {
      button.click()
      button.click()
      await Promise.resolve()
    })

    expect(mocks.openAppConfigEditor).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveOpen?.({ ok: true, message: '' })
      await Promise.resolve()
    })
  })

  test('disables the action when no selected editor is available', async () => {
    editorAvailable = false
    await render()

    expect(buttonByText('settings.general.open-app-config-action').disabled).toBe(true)
  })

  test('shows the editor failure returned by the server', async () => {
    mocks.openAppConfigEditor.mockResolvedValue({ ok: false, message: 'error.editor-not-installed' })
    await render()

    await act(async () => {
      buttonByText('settings.general.open-app-config-action').click()
      await Promise.resolve()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('settings.general.open-app-config-failed', {
      description: 'error.editor-not-installed',
    })
  })
})

async function render() {
  await act(async () => {
    root!.render(<GeneralSettings />)
    await Promise.resolve()
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes(text))
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button with text: ${text}`)
  return match
}
