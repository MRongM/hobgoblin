// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SETTINGS_PAGES } from '#/shared/settings-pages.ts'

const appLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}))
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock('#/web/App.tsx', () => ({
  App: ({ routeSettingsPage }: { routeSettingsPage: string | null }) => {
    useEffect(() => {
      appLifecycle.mounts += 1
      return () => {
        appLifecycle.unmounts += 1
      }
    }, [])
    return <output data-testid="route-settings-page">{routeSettingsPage ?? 'workspace'}</output>
  },
}))

vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtools: () => null,
}))

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => null),
})

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  appLifecycle.mounts = 0
  appLifecycle.unmounts = 0
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('mainRouter', () => {
  test('registers a route for every settings page', async () => {
    const { mainRouter } = await import('#/web/main-router.tsx')

    for (const page of SETTINGS_PAGES) {
      expect(mainRouter.routesByPath[`/settings/${page}`], `missing settings route for ${page}`).toBeDefined()
    }
  }, 30_000)

  test('keeps one App instance mounted while settings routes change', async () => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const { mainRouter, MainWindowRouterProvider } = await import('#/web/main-router.tsx')
    await mainRouter.navigate({ to: '/workspace' })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<MainWindowRouterProvider />)
      await Promise.resolve()
    })

    expect(appLifecycle.mounts).toBe(1)
    expect(container.querySelector('[data-testid="route-settings-page"]')?.textContent).toBe('workspace')

    await act(async () => {
      await mainRouter.navigate({ to: '/settings/general' })
    })
    await act(async () => {
      await mainRouter.navigate({ to: '/settings/files' })
    })

    expect(container.querySelector('[data-testid="route-settings-page"]')?.textContent).toBe('files')
    expect(appLifecycle.mounts).toBe(1)
    expect(appLifecycle.unmounts).toBe(0)
  })
})
