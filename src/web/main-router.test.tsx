// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SETTINGS_PAGES } from '#/shared/settings-pages.ts'
import type { RendererSurfaceBootstrap } from '#/shared/file-area.ts'

const appLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}))
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const routerBootstrap = vi.hoisted(() => ({
  runtimeKind: 'electron' as 'electron' | 'web',
  surface: { kind: 'main' } as RendererSurfaceBootstrap,
}))
const webHandoff = vi.hoisted(() => ({
  request: null as null | { repo: { kind: 'local'; id: string }; branch: string; tab: 'files' | 'history' },
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({
    runtime: { kind: routerBootstrap.runtimeKind, bridgeVersion: 1, capabilities: [] },
    homeDir: '',
    initialI18n: null,
    initialSettings: null,
    initialServer: null,
    surface: routerBootstrap.surface,
  }),
}))

vi.mock('#/web/lib/web-detached-file-area.ts', () => ({
  consumeWebDetachedFileAreaWindowHandoff: () => webHandoff.request,
}))

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

vi.mock('#/web/components/detached-file-area/DetachedFileAreaWindow.tsx', () => ({
  DetachedFileAreaWindow: ({ request }: { request: { branch: string; tab: string } }) => (
    <output data-testid="detached-file-area-route">{`${request.branch}:${request.tab}`}</output>
  ),
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
  routerBootstrap.surface = { kind: 'main' }
  routerBootstrap.runtimeKind = 'electron'
  webHandoff.request = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('mainRouter', () => {
  test('registers a route for every settings page', async () => {
    const { mainRouter } = await import('#/web/main-router.tsx')

    for (const page of SETTINGS_PAGES) {
      expect(mainRouter.routesByPath[`/settings/${page}`], `missing settings route for ${page}`).toBeDefined()
    }
  }, 30_000)

  test('registers and renders the detached file area route only for a detached renderer surface', async () => {
    routerBootstrap.surface = {
      kind: 'detached-file-area',
      request: {
        repo: { kind: 'local', id: '/repo' },
        branch: 'main',
        tab: 'history',
      },
    }
    const { mainRouter, MainWindowRouterProvider } = await import('#/web/main-router.tsx')
    expect(mainRouter.routesByPath['/detached/file-area']).toBeDefined()
    await mainRouter.navigate({ to: '/detached/file-area' })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<MainWindowRouterProvider />)
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="detached-file-area-route"]')?.textContent).toBe('main:history')
    expect(container.querySelector('[data-testid="route-settings-page"]')).toBeNull()
  })

  test('renders the detached route in Web mode after consuming a same-origin handoff', async () => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    routerBootstrap.runtimeKind = 'web'
    webHandoff.request = {
      repo: { kind: 'local', id: '/repo' },
      branch: 'main',
      tab: 'files',
    }
    const { mainRouter, MainWindowRouterProvider } = await import('#/web/main-router.tsx')
    await mainRouter.navigate({ to: '/workspace' })
    await mainRouter.navigate({ to: '/detached/file-area' })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<MainWindowRouterProvider />)
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="detached-file-area-route"]')?.textContent).toBe('main:files')
    expect(container.querySelector('[data-testid="route-settings-page"]')).toBeNull()
  })

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
