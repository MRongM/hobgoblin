// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectThemeMenu } from '#/web/components/repo-toolbar/ProjectThemeMenu.tsx'

const writeMocks = vi.hoisted(() => ({
  runSettingsControllerAction: vi.fn(async (_label: string, task: () => Promise<void>) => await task()),
  setProjectColorThemePreference: vi.fn(async () => {}),
}))

vi.mock('#/web/settings-write-paths.ts', () => ({
  runSettingsControllerAction: writeMocks.runSettingsControllerAction,
  setProjectColorThemePreference: writeMocks.setProjectColorThemePreference,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) =>
    ({
      'project-theme.menu': 'Project theme',
      'project-theme.follow-global': 'Follow global',
      'settings.theme-preset.macos': 'macOS',
      'settings.theme-preset.mono': 'Mono',
      'settings.theme-preset.github': 'GitHub',
      'settings.theme-preset.claude': 'Claude',
      'settings.theme-preset.cursor': 'Cursor',
      'settings.theme-preset.airbnb': 'Airbnb',
      'settings.theme-preset.bmw': 'BMW',
    })[key] ?? key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  writeMocks.runSettingsControllerAction.mockClear()
  writeMocks.setProjectColorThemePreference.mockClear()
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

describe('ProjectThemeMenu', () => {
  test('shows project theme choices and writes selected theme', async () => {
    await render(<ProjectThemeMenu repoId="/repo-a" projectColorTheme={null} />)

    await act(async () => {
      openProjectThemeMenu()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('Follow global')
    expect(document.body.textContent).toContain('Cursor')

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
        .find((item) => item.textContent?.includes('Cursor'))
        ?.click()
      await Promise.resolve()
    })

    expect(writeMocks.runSettingsControllerAction).toHaveBeenCalledWith('project theme update', expect.any(Function))
    expect(writeMocks.setProjectColorThemePreference).toHaveBeenCalledWith('/repo-a', 'cursor')
  })

  test('writes null when follow global is selected', async () => {
    await render(<ProjectThemeMenu repoId="/repo-a" projectColorTheme="cursor" />)

    await act(async () => {
      openProjectThemeMenu()
      await Promise.resolve()
    })

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
        .find((item) => item.textContent?.includes('Follow global'))
        ?.click()
      await Promise.resolve()
    })

    expect(writeMocks.setProjectColorThemePreference).toHaveBeenCalledWith('/repo-a', null)
  })
})

async function render(element: React.ReactElement) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(element)
    await Promise.resolve()
  })
}

function openProjectThemeMenu() {
  container
    ?.querySelector<HTMLButtonElement>('button[aria-label="Project theme"]')
    ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
}
