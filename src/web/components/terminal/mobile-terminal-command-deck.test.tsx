// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MobileTerminalCommandDeck } from '#/web/components/terminal/mobile-terminal-toolbar.tsx'

const translations: Record<string, string> = {
  'terminal.command-deck': 'Terminal command deck',
  'terminal.command-deck.previous-terminal': 'Previous terminal',
  'terminal.command-deck.next-terminal': 'Next terminal',
  'terminal.command-deck.compose': 'Compose',
  'terminal.command-deck.hide-compose': 'Hide compose',
  'terminal.command-deck.original-width': 'Original width',
  'terminal.command-deck.fit-width': 'Fit width',
  'terminal.command-deck.input-placeholder': 'Command',
  'terminal.command-deck.send': 'Send',
}

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => translations[key] ?? key,
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('MobileTerminalCommandDeck', () => {
  test('renders the exact Android extra-key rows and Web action row', async () => {
    const fixture = await renderToolbar()
    try {
      const rows = [...fixture.container.querySelectorAll('.goblin-terminal-command-deck__row')]
      expect(rows).toHaveLength(3)
      expect(buttonLabels(rows[0])).toEqual(['ESC', '/', '-', 'HOME', '↑', 'END', 'PGUP'])
      expect(buttonLabels(rows[1])).toEqual(['TAB', 'CTRL', 'ALT', '←', '↓', '→', 'PGDN'])
      expect(buttonLabels(rows[2])).toEqual(['ENTER', '⌫', 'CTRL+C', 'CTRL+L', 'T↑', 'T↓', 'Compose', 'Original width'])
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
        button('ENTER')?.click()
        button('⌫')?.click()
        button('CTRL+C')?.click()
        button('CTRL+L')?.click()
        button('T↑')?.click()
        button('T↓')?.click()
      })
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
    } finally {
      await fixture.cleanup()
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
  const onCycleTerminal = vi.fn()
  const onFitToWidthChange = vi.fn()

  await act(async () => {
    root.render(
      <MobileTerminalCommandDeck
        terminalCount={2}
        fitToWidth
        onExtraKey={onExtraKey}
        onInput={onInput}
        onCycleTerminal={onCycleTerminal}
        onFitToWidthChange={onFitToWidthChange}
      />,
    )
  })

  return {
    container,
    onExtraKey,
    onInput,
    onCycleTerminal,
    onFitToWidthChange,
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
