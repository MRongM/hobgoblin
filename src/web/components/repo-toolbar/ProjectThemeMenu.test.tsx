// @vitest-environment jsdom

import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsSnapshot } from '#/shared/settings-defaults.ts'
import {
  ProjectThemeMenu,
  ProjectThemeMenuConnected,
} from '#/web/components/repo-toolbar/ProjectThemeMenu.tsx'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

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
      'settings.theme-preset.signal': 'Signal',
      'settings.theme-preset.forge': 'Forge',
      'settings.theme-preset.catppuccin': 'Catppuccin',
      'settings.theme-preset.solarized': 'Solarized',
      'settings.theme-preset.tokyo-night': 'Tokyo Night',
    })[key] ?? key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  mainWindowQueryClient.clear()
  resetReposStore()
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
  mainWindowQueryClient.clear()
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
    expect(
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      'Follow global',
      'macOS',
      'Mono',
      'GitHub',
      'Claude',
      'Cursor',
      'Airbnb',
      'BMW',
      'Signal',
      'Forge',
      'Catppuccin',
      'Solarized',
      'Tokyo Night',
    ])

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

  test.each([
    ['catppuccin', 'Catppuccin'],
    ['solarized', 'Solarized'],
    ['tokyo-night', 'Tokyo Night'],
  ] as const)('writes %s project theme', async (colorTheme, label) => {
    await render(<ProjectThemeMenu repoId="/repo-a" projectColorTheme={null} />)

    await act(async () => {
      openProjectThemeMenu()
      await Promise.resolve()
    })

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
        .find((item) => item.textContent?.includes(label))
        ?.click()
      await Promise.resolve()
    })

    expect(writeMocks.setProjectColorThemePreference).toHaveBeenCalledWith('/repo-a', colorTheme)
  })

  test('binds a visible workspace member theme menu to its active project', async () => {
    const workspaceId = 'ssh-config://demo/srv/workspace'
    const memberId = `${workspaceId}/repo`
    mainWindowQueryClient.setQueryData(
      settingsSnapshotQueryKey(),
      defaultSettingsSnapshot({
        repoSettings: [
          { repoId: workspaceId, colorTheme: 'cursor' },
          { repoId: memberId, colorTheme: 'github' },
        ],
      }),
    )
    useReposStore.setState({ activeId: memberId, activeProjectId: workspaceId })

    await render(
      <QueryClientProvider client={mainWindowQueryClient}>
        <ProjectThemeMenuConnected repoId={memberId} />
      </QueryClientProvider>,
    )

    await act(async () => {
      openProjectThemeMenu()
      await Promise.resolve()
    })

    const items = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
    expect(items.find((item) => item.textContent?.includes('Cursor'))?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      items.find((item) => item.textContent?.includes('Solarized'))?.click()
      await Promise.resolve()
    })

    expect(writeMocks.setProjectColorThemePreference).toHaveBeenCalledWith(workspaceId, 'solarized')
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
