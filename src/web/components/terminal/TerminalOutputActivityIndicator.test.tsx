// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TerminalOutputActivityIndicator', () => {
  test('renders an active fixed-size terminal output activity indicator', () => {
    act(() => {
      root!.render(<TerminalOutputActivityIndicator label="Terminal output active" active />)
    })

    const indicator = document.body.querySelector('[data-terminal-output-activity-indicator="active"]')
    expect(indicator?.getAttribute('aria-label')).toBe('Terminal output active')
    expect(indicator?.querySelector('[data-terminal-output-activity-ping]')).not.toBeNull()
    expect(indicator?.querySelector('[data-terminal-output-activity-glow]')).not.toBeNull()
    const ping = indicator?.querySelector('[data-terminal-output-activity-ping]')
    const glow = indicator?.querySelector('[data-terminal-output-activity-glow]')
    const icon = indicator?.querySelector('svg')

    expect(ping?.classList.contains('border-terminal-activity-border')).toBe(true)
    expect(ping?.classList.contains('bg-terminal-activity')).toBe(true)
    expect(glow?.classList.contains('bg-terminal-activity-surface')).toBe(true)
    expect(icon?.classList.contains('text-terminal-activity')).toBe(true)
    expect(icon?.classList.contains('text-success')).toBe(false)
    expect(indicator?.querySelector('svg')?.classList.contains('animate-pulse')).toBe(true)
  })

  test('renders every active effect with the terminal bell palette when requested', () => {
    act(() => {
      root!.render(<TerminalOutputActivityIndicator label="Terminal output active" active tone="bell" />)
    })

    const indicator = document.body.querySelector('[data-terminal-output-activity-indicator="active"]')
    const ping = indicator?.querySelector<HTMLElement>('[data-terminal-output-activity-ping]')
    const glow = indicator?.querySelector<HTMLElement>('[data-terminal-output-activity-glow]')
    const icon = indicator?.querySelector<SVGElement>('svg')

    expect(ping?.classList.contains('border-terminal-bell-border')).toBe(true)
    expect(ping?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(ping?.classList.contains('bg-terminal-activity')).toBe(false)
    expect(glow?.classList.contains('bg-terminal-bell-surface')).toBe(true)
    expect(glow?.style.boxShadow).toContain('var(--color-terminal-bell-rgb)')
    expect(icon?.classList.contains('text-terminal-bell')).toBe(true)
    expect(icon?.classList.contains('text-terminal-activity')).toBe(false)
    expect(icon?.style.filter).toContain('var(--color-terminal-bell-rgb)')
  })

  test('renders an idle icon without the ping layer', () => {
    act(() => {
      root!.render(<TerminalOutputActivityIndicator label="Terminal output active" active={false} />)
    })

    const indicator = document.body.querySelector('[data-terminal-output-activity-indicator="idle"]')
    expect(indicator?.querySelector('[data-terminal-output-activity-ping]')).toBeNull()
    expect(indicator?.querySelector('[data-terminal-output-activity-glow]')).toBeNull()
    expect(indicator?.querySelector('svg')?.classList.contains('animate-pulse')).toBe(false)
  })
})
