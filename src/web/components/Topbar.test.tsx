// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Topbar } from '#/web/components/Topbar.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
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

describe('Topbar', () => {
  test('keeps every topbar function in the shared mobile horizontal scroll container', () => {
    act(() => {
      root!.render(
        <Topbar actions={<button type="button">action</button>}>
          <div data-testid="tabs" />
        </Topbar>,
      )
    })

    const topbar = container!.firstElementChild
    const tabs = container!.querySelector('[data-testid="tabs"]')
    const actions = container!.querySelector('[data-testid="topbar-actions"]')

    expect(topbar?.classList.contains('mobile-topbar-scroll')).toBe(true)
    expect(tabs?.parentElement).toBe(topbar)
    expect(actions?.parentElement).toBe(topbar)
  })

  test('uses runtime topbar height', () => {
    act(() => {
      root!.render(
        <Topbar actions={<button type="button">action</button>}>
          <div data-testid="tabs" />
        </Topbar>,
      )
    })

    expect(container!.firstElementChild).toBeInstanceOf(HTMLElement)
    expect((container!.firstElementChild as HTMLElement).style.height).toBe('39px')
    const actions = container!.querySelector<HTMLElement>('[data-testid="topbar-actions"]')
    expect(actions?.textContent).toBe('action')
  })
})
