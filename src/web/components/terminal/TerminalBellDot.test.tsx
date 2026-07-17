// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'

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

describe('TerminalBellDot', () => {
  test('renders a themed unread bell dot with ping by default', () => {
    act(() => {
      root!.render(<TerminalBellDot label="Unread terminal bell" />)
    })

    const dot = document.body.querySelector('[data-terminal-bell-dot]')
    const ping = document.body.querySelector('[data-terminal-bell-ping]')
    const core = document.body.querySelector('[data-terminal-bell-core]')

    expect(dot?.getAttribute('aria-label')).toBe('Unread terminal bell')
    expect(ping).not.toBeNull()
    expect(ping?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(ping?.classList.contains('bg-attention')).toBe(false)
    expect(ping?.classList.contains('opacity-75')).toBe(true)
    expect(core?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(core?.classList.contains('bg-attention')).toBe(false)
  })

  test('allows a caller to override only the ping layer opacity', () => {
    act(() => {
      root!.render(<TerminalBellDot label="Unread terminal bell" pingClassName="opacity-100" />)
    })

    const ping = document.body.querySelector('[data-terminal-bell-ping]')
    const core = document.body.querySelector('[data-terminal-bell-core]')

    expect(ping?.classList.contains('opacity-100')).toBe(true)
    expect(ping?.classList.contains('opacity-75')).toBe(false)
    expect(ping?.classList.contains('bg-terminal-bell')).toBe(true)
    expect(core?.classList.contains('bg-terminal-bell')).toBe(true)
  })

  test('renders the themed unread bell dot without ping when requested', () => {
    act(() => {
      root!.render(<TerminalBellDot label="Unread terminal bell" ping={false} />)
    })

    expect(document.body.querySelector('[data-terminal-bell-ping]')).toBeNull()
    expect(document.body.querySelector('[data-terminal-bell-core]')?.classList.contains('bg-terminal-bell')).toBe(true)
  })
})
