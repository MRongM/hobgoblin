// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { SETTINGS_PAGES } from '#/shared/settings-pages.ts'

vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtools: () => null,
}))

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => null),
})

describe('mainRouter', () => {
  test('registers a route for every settings page', async () => {
    const { mainRouter } = await import('#/web/main-router.tsx')

    for (const page of SETTINGS_PAGES) {
      expect(mainRouter.routesByPath[`/settings/${page}`], `missing settings route for ${page}`).toBeDefined()
    }
  }, 15_000)
})
