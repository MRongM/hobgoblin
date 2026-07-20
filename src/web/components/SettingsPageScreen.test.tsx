// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SettingsPageScreen } from '#/web/components/SettingsPageScreen.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
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
  test('renders settings as a constrained dialog over a themed blurred scrim', () => {
    const onClose = vi.fn()

    act(() => {
      root!.render(<SettingsPageScreen page="general" onClose={onClose} onPageChange={() => {}} />)
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('settings.title')
    expect(dialog?.className).toContain('h-[min(50rem,calc(100dvh-2rem))]')
    expect(dialog?.className).toContain('sm:max-w-[68rem]')

    const overlay = document.body.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
    expect(overlay?.className).toContain('bg-[var(--color-overlay-scrim)]')
    expect(overlay?.className).toContain('backdrop-blur-[2px]')

    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')?.click()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
