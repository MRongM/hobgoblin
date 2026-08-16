// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Logo } from '#/web/components/Logo.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
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

describe('Logo', () => {
  test('renders the clean Hobgoblin wordmark with an accessible label', () => {
    render(<Logo />)

    const logo = document.body.querySelector('[aria-label="Hobgoblin"]')
    expect(logo).toBeInstanceOf(HTMLSpanElement)
    expect(logo?.textContent).toBe('Hobgoblin')
    expect(logo?.querySelector('svg')).toBeNull()
    expect(logo?.getAttribute('style')).toContain('font-weight: 600')
    expect(logo?.getAttribute('style')).toContain('letter-spacing: 0px')
  })
})

function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
}
