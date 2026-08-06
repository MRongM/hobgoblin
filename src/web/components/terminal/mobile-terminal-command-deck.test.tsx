// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  MobileTerminalDock,
  type MobileTerminalDockProjection,
} from '#/web/components/terminal/mobile-terminal-toolbar.tsx'

const translations: Record<string, string> = {
  'terminal.command-deck': 'Terminal command deck',
  'terminal.command-deck.scroll-to-bottom': 'Back to bottom',
  'terminal.command-deck.previous-terminal': 'Previous terminal',
  'terminal.command-deck.next-terminal': 'Next terminal',
  'terminal.command-deck.page-up': 'Page up',
  'terminal.command-deck.page-down': 'Page down',
  'terminal.command-deck.compose': 'Compose',
  'terminal.command-deck.hide-compose': 'Hide compose',
  'terminal.command-deck.original-width': 'Original width',
  'terminal.command-deck.fit-width': 'Fit width',
  'terminal.command-deck.focus': 'Focus',
  'terminal.command-deck.input-placeholder': 'Command',
  'terminal.command-deck.send': 'Send',
  'terminal.takeover': 'Take over',
}

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => translations[key] ?? key,
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('MobileTerminalDock', () => {
  test('renders the exact Android extra-key rows and Web action row', async () => {
    const fixture = await renderToolbar()
    try {
      const rows = [...fixture.container.querySelectorAll('.goblin-terminal-command-deck__row')]
      expect(rows).toHaveLength(3)
      expect(
        rows.slice(0, 2).every((row) => row.classList.contains('goblin-terminal-command-deck__row--extra-keys')),
      ).toBe(true)
      expect(rows[2]?.classList.contains('goblin-terminal-command-deck__row--extra-keys')).toBe(false)
      expect(buttonLabels(rows[0])).toEqual(['ESC', '/', '-', 'HOME', '↑', 'END', 'PGUP'])
      expect(buttonLabels(rows[1])).toEqual(['TAB', 'CTRL', 'ALT', '←', '↓', '→', 'PGDN'])
      expect(buttonLabels(rows[2])).toEqual([
        'T↑',
        'T↓',
        'Back to bottom',
        'ENTER',
        '⌫',
        'CTRL+C',
        'CTRL+L',
        'Compose',
        'Original width',
        'Focus',
      ])
    } finally {
      await fixture.cleanup()
    }
  })

  test('applies visible one-shot Ctrl and Alt state to the next extra key', async () => {
    const fixture = await renderToolbar()
    try {
      const button = (label: string) =>
        [...fixture.container.querySelectorAll<HTMLButtonElement>('button')].find(
          (candidate) => candidate.textContent === label,
        )

      await act(async () => button('CTRL')?.click())
      expect(button('CTRL on')?.getAttribute('aria-pressed')).toBe('true')
      await act(async () => button('↑')?.click())
      expect(fixture.onExtraKey).toHaveBeenLastCalledWith({
        key: 'arrow-up',
        ctrlPressed: true,
        altPressed: false,
      })
      expect(button('CTRL')).toBeDefined()

      await act(async () => button('ALT')?.click())
      await act(async () => button('ALT on')?.click())
      await act(async () => button('→')?.click())
      expect(fixture.onExtraKey).toHaveBeenLastCalledWith({
        key: 'arrow-right',
        ctrlPressed: false,
        altPressed: false,
      })
    } finally {
      await fixture.cleanup()
    }
  })

  test('sends direct keys, cycles terminals, composes a command, and toggles width', async () => {
    const fixture = await renderToolbar()
    try {
      const button = (label: string) =>
        [...fixture.container.querySelectorAll<HTMLButtonElement>('button')].find(
          (candidate) => candidate.textContent === label,
        )

      await act(async () => {
        button('Back to bottom')?.click()
        button('ENTER')?.click()
        button('⌫')?.click()
        button('CTRL+C')?.click()
        button('CTRL+L')?.click()
        button('T↑')?.click()
        button('T↓')?.click()
      })
      expect(fixture.onScrollToBottom).toHaveBeenCalledTimes(1)
      expect(fixture.onInput.mock.calls).toEqual([['\r'], ['\x7f'], ['\x03'], ['\x0c']])
      expect(fixture.onCycleTerminal.mock.calls).toEqual([[-1], [1]])

      await act(async () => button('Compose')?.click())
      const input = fixture.container.querySelector<HTMLInputElement>('input')
      expect(input?.placeholder).toBe('Command')
      await act(async () => setInputValue(input, 'printf test'))
      await act(async () => button('Send')?.click())
      expect(fixture.onInput).toHaveBeenLastCalledWith('printf test\r')
      expect(input?.value).toBe('')

      await act(async () => button('Original width')?.click())
      expect(fixture.onFitToWidthChange).toHaveBeenCalledWith(false)

      await act(async () => button('Focus')?.click())
      expect(fixture.onEnterFocus).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.cleanup()
    }
  })

  test('fills the read-only takeover action without input controls or status copy', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onTakeover = vi.fn()

    await act(async () => {
      root.render(
        <MobileTerminalDock
          terminalKey="terminal-1"
          terminalCount={2}
          projection={{
            kind: 'readonly',
            takeoverPending: false,
            onTakeover,
          }}
          onScrollToBottom={vi.fn()}
          onCycleTerminal={vi.fn()}
        />,
      )
    })

    try {
      const actionRow = container.querySelector('.goblin-terminal-command-deck__row--actions')
      expect([...(actionRow?.children ?? [])].map((child) => child.textContent)).toEqual([
        'T↑',
        'T↓',
        'Back to bottom',
        'Take over',
      ])
      expect(actionRow?.querySelector('[role="status"]')).toBeNull()
      expect(container.textContent).not.toContain('Mirror controlled elsewhere')
      expect(container.querySelectorAll('.goblin-terminal-command-deck__row--extra-keys')).toHaveLength(0)
      expect(container.textContent).not.toContain('ENTER')
      expect(container.textContent).not.toContain('Compose')

      const takeoverButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'Take over',
      )
      await act(async () => takeoverButton?.click())
      expect(onTakeover).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('renders plain double-arrow tmux page actions in the read-only dock', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onTmuxPage = vi.fn()

    await act(async () => {
      root.render(
        <MobileTerminalDock
          terminalKey="terminal-1"
          terminalCount={2}
          projection={{
            kind: 'readonly',
            takeoverPending: false,
            onTakeover: vi.fn(),
            onTmuxPage,
          }}
          onScrollToBottom={vi.fn()}
          onCycleTerminal={vi.fn()}
        />,
      )
    })

    try {
      const actionRow = container.querySelector('.goblin-terminal-command-deck__row--actions')
      const buttons = [...(actionRow?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      expect(buttons.map((button) => button.textContent)).toEqual(['T↑', 'T↓', 'Back to bottom', '⇈', '⇊', 'Take over'])
      expect(buttons[3]).toMatchObject({ title: 'Page up' })
      expect(buttons[3]?.getAttribute('aria-label')).toBe('Page up')
      expect(buttons[4]).toMatchObject({ title: 'Page down' })
      expect(buttons[4]?.getAttribute('aria-label')).toBe('Page down')

      await act(async () => {
        buttons[3]?.click()
        buttons[4]?.click()
      })
      expect(onTmuxPage.mock.calls).toEqual([['up'], ['down']])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('preserves invariant actions and resets controller state across terminal and authority changes', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onExtraKey = vi.fn()
    const onInput = vi.fn()
    const onScrollToBottom = vi.fn()
    const onCycleTerminal = vi.fn()
    const onFitToWidthChange = vi.fn()
    const onEnterFocus = vi.fn()
    const controllerProjection = () => ({
      kind: 'controller' as const,
      inputMethodVisible: true,
      fitToWidth: true,
      onExtraKey,
      onInput,
      onFitToWidthChange,
      onEnterFocus,
    })
    const renderDock = (terminalKey: string, projection: MobileTerminalDockProjection = controllerProjection()) =>
      root.render(
        <MobileTerminalDock
          terminalKey={terminalKey}
          terminalCount={2}
          projection={projection}
          onScrollToBottom={onScrollToBottom}
          onCycleTerminal={onCycleTerminal}
        />,
      )
    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label)

    await act(async () => renderDock('terminal-1'))
    const previousBefore = button('T↑')
    const nextBefore = button('T↓')
    const returnBefore = button('Back to bottom')

    await act(async () => {
      button('CTRL')?.click()
      button('Compose')?.click()
    })
    await act(async () => setInputValue(container.querySelector<HTMLInputElement>('input'), 'printf test'))

    await act(async () => renderDock('terminal-2'))

    try {
      expect(button('T↑')).toBe(previousBefore)
      expect(button('T↓')).toBe(nextBefore)
      expect(button('Back to bottom')).toBe(returnBefore)
      expect(container.querySelector('.goblin-terminal-command-deck__composer-input')).toBeNull()
      expect(button('CTRL')?.getAttribute('aria-pressed')).toBe('false')

      await act(async () => {
        button('ALT')?.click()
        button('Compose')?.click()
      })
      await act(async () => setInputValue(container.querySelector<HTMLInputElement>('input'), 'stale draft'))
      await act(async () =>
        renderDock('terminal-2', {
          kind: 'readonly',
          takeoverPending: false,
          onTakeover: vi.fn(),
        }),
      )
      expect(button('T↑')).toBe(previousBefore)
      expect(button('T↓')).toBe(nextBefore)
      expect(button('Back to bottom')).toBe(returnBefore)
      await act(async () => renderDock('terminal-2'))

      expect(button('T↑')).toBe(previousBefore)
      expect(button('T↓')).toBe(nextBefore)
      expect(button('Back to bottom')).toBe(returnBefore)
      expect(button('ALT')?.getAttribute('aria-pressed')).toBe('false')
      expect(container.querySelector('.goblin-terminal-command-deck__composer-input')).toBeNull()
      await act(async () => button('Compose')?.click())
      expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  test('shows extra-key rows only while the input method is visible without replacing invariant actions', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const controllerProjection = (inputMethodVisible: boolean): MobileTerminalDockProjection => ({
      kind: 'controller',
      inputMethodVisible,
      fitToWidth: true,
      onExtraKey: vi.fn(),
      onInput: vi.fn(),
      onFitToWidthChange: vi.fn(),
      onEnterFocus: vi.fn(),
    })
    const renderDock = (inputMethodVisible: boolean) =>
      root.render(
        <MobileTerminalDock
          terminalKey="terminal-1"
          terminalCount={2}
          projection={controllerProjection(inputMethodVisible)}
          onScrollToBottom={vi.fn()}
          onCycleTerminal={vi.fn()}
        />,
      )
    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label)

    await act(async () => renderDock(false))
    const previousBefore = button('T↑')
    const nextBefore = button('T↓')
    const returnBefore = button('Back to bottom')

    try {
      expect(container.querySelectorAll('.goblin-terminal-command-deck__row--extra-keys')).toHaveLength(0)

      await act(async () => renderDock(true))
      expect(container.querySelectorAll('.goblin-terminal-command-deck__row--extra-keys')).toHaveLength(2)
      expect(button('T↑')).toBe(previousBefore)
      expect(button('T↓')).toBe(nextBefore)
      expect(button('Back to bottom')).toBe(returnBefore)

      await act(async () => renderDock(false))
      expect(container.querySelectorAll('.goblin-terminal-command-deck__row--extra-keys')).toHaveLength(0)
      expect(button('T↑')).toBe(previousBefore)
      expect(button('T↓')).toBe(nextBefore)
      expect(button('Back to bottom')).toBe(returnBefore)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})

async function renderToolbar() {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onExtraKey = vi.fn()
  const onInput = vi.fn()
  const onScrollToBottom = vi.fn()
  const onCycleTerminal = vi.fn()
  const onFitToWidthChange = vi.fn()
  const onEnterFocus = vi.fn()

  await act(async () => {
    root.render(
      <MobileTerminalDock
        terminalKey="terminal-1"
        terminalCount={2}
        projection={{
          kind: 'controller',
          inputMethodVisible: true,
          fitToWidth: true,
          onExtraKey,
          onInput,
          onFitToWidthChange,
          onEnterFocus,
        }}
        onScrollToBottom={onScrollToBottom}
        onCycleTerminal={onCycleTerminal}
      />,
    )
  })

  return {
    container,
    onExtraKey,
    onInput,
    onScrollToBottom,
    onCycleTerminal,
    onFitToWidthChange,
    onEnterFocus,
    cleanup: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

function buttonLabels(row: Element | undefined): string[] {
  return [...(row?.querySelectorAll(':scope > button') ?? [])].map((button) => button.textContent ?? '')
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) throw new Error('missing command input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
