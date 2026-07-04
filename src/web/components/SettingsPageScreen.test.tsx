// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SettingsPageScreen } from '#/web/components/SettingsPageScreen.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

vi.mock('#/web/components/SettingsSurface.tsx', () => ({
  SettingsSurface: () => <div data-testid="settings-surface" />,
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SettingsPageScreen', () => {
  test('uses runtime topbar height', () => {
    act(() => {
      root!.render(<SettingsPageScreen page="general" onBack={() => {}} onPageChange={() => {}} />)
    })

    const topbar = container!.querySelector<HTMLElement>('.topbar')
    expect(topbar?.style.height).toBe('39px')
  })
})
