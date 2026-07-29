// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AboutSettings } from '#/web/components/settings/pages/AboutSettings.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('__APP_VERSION__', '0.1.0')
  vi.stubGlobal('__BUILD_INFO__', { commit: 'abc1234' })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('AboutSettings', () => {
  test('renders the injected application version', async () => {
    vi.stubGlobal('__APP_VERSION__', '9.8.7')

    await render(<AboutSettings />)

    expect(document.body.textContent).toContain('v9.8.7')
  })

  test('opens and closes the bundled font license documents offline', async () => {
    await render(<AboutSettings />)

    expect(document.body.textContent).toContain('about.third-party-licenses')
    expect(document.body.textContent).toContain('about.third-party-licenses.body')

    await act(async () => {
      buttonByText('about.third-party-licenses.open').click()
      await Promise.resolve()
    })

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.classList.contains('grid-rows-[auto_minmax(0,1fr)_auto]')).toBe(true)

    const scrollRegion = dialog?.querySelector('[data-slot="third-party-license-scroll-region"]')
    expect(scrollRegion).not.toBeNull()
    expect(scrollRegion?.classList.contains('min-h-0')).toBe(true)
    expect(scrollRegion?.classList.contains('overflow-y-auto')).toBe(true)
    expect(scrollRegion?.classList.contains('overscroll-contain')).toBe(true)
    expect(dialog?.textContent).toContain('about.third-party-licenses.dialog-title')
    expect(dialog?.textContent).toContain('# Third-Party Notices')
    expect(dialog?.textContent).toContain('Maple Mono')
    expect(dialog?.textContent).toContain('Nerd Fonts')
    expect(dialog?.textContent).toContain('Resource Han Rounded')
    expect(dialog?.querySelectorAll('pre')).toHaveLength(4)

    await act(async () => {
      buttonByText('dialog.close').click()
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})

async function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(element)
    await Promise.resolve()
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(document.body.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  )
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button with text: ${text}`)
  return match
}
