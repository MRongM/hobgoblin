// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import { stabilizeTerminalOutputCursor } from './terminal-output-cursor-stabilizer.ts'

function terminalFixture() {
  const element = document.createElement('div')
  element.className = 'xterm'
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  screen.style.width = '1000px'
  screen.style.height = '600px'
  const textarea = document.createElement('textarea')
  const nativeCursor = document.createElement('span')
  nativeCursor.className = 'xterm-cursor xterm-cursor-bar'
  screen.append(textarea, nativeCursor)
  element.append(screen)
  document.body.append(element)
  const buffer = {
    type: 'normal' as 'normal' | 'alternate',
    cursorX: 2,
    cursorY: 27,
    viewportY: 0,
    baseY: 0,
  }
  const dataHandlers = new Set<(data: string) => void>()
  const renderHandlers = new Set<() => void>()
  const terminal = {
    buffer: { active: buffer },
    cols: 100,
    element,
    onData: (handler: (data: string) => void) => {
      dataHandlers.add(handler)
      return { dispose: () => dataHandlers.delete(handler) }
    },
    onRender: (handler: () => void) => {
      renderHandlers.add(handler)
      return { dispose: () => renderHandlers.delete(handler) }
    },
    rows: 30,
    textarea,
  } as unknown as XTermTerminal

  return {
    buffer,
    element,
    fireData: (data: string) => dataHandlers.forEach((handler) => handler(data)),
    fireRender: () => renderHandlers.forEach((handler) => handler()),
    nativeCursor,
    screen,
    terminal,
    textarea,
  }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('stabilizeTerminalOutputCursor', () => {
  test('keeps the focused Windows cursor at the composer across transient inline TUI frames', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    fixture.textarea.focus()
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?2026hstatus frame\x1b[?2026l')
    fixture.buffer.cursorX = 30
    fixture.buffer.cursorY = 22
    stabilizer.handleOutput('\x1b[?25ltransient status cursor\x1b[?25h')

    const proxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-output-cursor-proxy')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(true)
    expect([proxy?.style.left, proxy?.style.top, proxy?.style.height]).toEqual(['20px', '540px', '20px'])

    fixture.buffer.cursorX = 2
    fixture.buffer.cursorY = 27
    stabilizer.handleOutput('\x1b[?25lrestore composer cursor\x1b[?25h')
    vi.advanceTimersByTime(249)
    expect(proxy?.classList.contains('is-active')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)
    expect(proxy?.classList.contains('is-active')).toBe(false)

    stabilizer.dispose()
  })

  test('detects a synchronized-output marker split across live writes', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    fixture.textarea.focus()
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?20')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)
    stabilizer.handleOutput('26hframe')

    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(true)
    stabilizer.dispose()
  })

  test('aligns the proxy to the rendered xterm cursor when DOM geometry is measurable', () => {
    const fixture = terminalFixture()
    fixture.textarea.focus()
    fixture.screen.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 1000, height: 600 } as DOMRect)
    fixture.nativeCursor.getBoundingClientRect = () =>
      ({ left: 123, top: 594, width: 10, height: 20 } as DOMRect)
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')

    const proxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-output-cursor-proxy')
    expect([proxy?.style.left, proxy?.style.top, proxy?.style.height]).toEqual(['23px', '544px', '20px'])
    stabilizer.dispose()
  })

  test('settles a newly activated proxy on the repeated composer geometry', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    fixture.textarea.focus()
    fixture.screen.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 1000, height: 600 } as DOMRect)
    let cursorRect = { left: 500, top: 300, width: 10, height: 20 } as DOMRect
    fixture.nativeCursor.getBoundingClientRect = () => cursorRect
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')
    const proxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-output-cursor-proxy')
    expect([proxy?.style.left, proxy?.style.top]).toEqual(['400px', '250px'])

    cursorRect = { left: 900, top: 580, width: 10, height: 20 } as DOMRect
    fixture.fireRender()
    cursorRect = { left: 143, top: 594, width: 10, height: 20 } as DOMRect
    fixture.fireRender()
    fixture.fireRender()
    vi.advanceTimersByTime(120)

    expect([proxy?.style.left, proxy?.style.top]).toEqual(['43px', '544px'])
    stabilizer.dispose()
  })

  test('reanchors after user input renders without following output-only cursor movement', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    fixture.textarea.focus()
    fixture.screen.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 1000, height: 600 } as DOMRect)
    let cursorRect = { left: 123, top: 594, width: 10, height: 20 } as DOMRect
    fixture.nativeCursor.getBoundingClientRect = () => cursorRect
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')
    cursorRect = { left: 500, top: 300, width: 10, height: 20 } as DOMRect
    fixture.fireRender()

    const proxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-output-cursor-proxy')
    expect([proxy?.style.left, proxy?.style.top]).toEqual(['23px', '544px'])

    fixture.fireData('今')
    cursorRect = { left: 500, top: 300, width: 10, height: 20 } as DOMRect
    fixture.fireRender()
    cursorRect = { left: 143, top: 594, width: 10, height: 20 } as DOMRect
    fixture.fireRender()
    fixture.fireRender()
    vi.advanceTimersByTime(119)
    expect([proxy?.style.left, proxy?.style.top]).toEqual(['23px', '544px'])
    vi.advanceTimersByTime(1)
    expect([proxy?.style.left, proxy?.style.top]).toEqual(['43px', '544px'])

    cursorRect = { left: 700, top: 200, width: 10, height: 20 } as DOMRect
    fixture.fireRender()
    expect([proxy?.style.left, proxy?.style.top]).toEqual(['43px', '544px'])
    stabilizer.dispose()
  })

  test('leaves ordinary PowerShell output and alternate-screen TUIs on the native cursor path', () => {
    const fixture = terminalFixture()
    fixture.textarea.focus()
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('ordinary PowerShell output\r\n')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)

    fixture.buffer.type = 'alternate'
    stabilizer.handleOutput('\x1b[?2026hfull-screen frame\x1b[?2026l')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)
    stabilizer.dispose()
  })

  test('does not place a live cursor over scrollback or an unfocused terminal', () => {
    const fixture = terminalFixture()
    fixture.buffer.baseY = 20
    fixture.buffer.viewportY = 5
    fixture.textarea.focus()
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'Win32')

    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)

    fixture.buffer.viewportY = 20
    fixture.textarea.blur()
    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')
    expect(fixture.element.classList.contains('goblin-terminal-output-cursor-stabilized')).toBe(false)
    stabilizer.dispose()
  })

  test('is a no-op outside Windows and removes its proxy on dispose', () => {
    const fixture = terminalFixture()
    fixture.textarea.focus()
    const stabilizer = stabilizeTerminalOutputCursor(fixture.terminal, 'MacIntel')

    stabilizer.handleOutput('\x1b[?2026hframe\x1b[?2026l')
    expect(fixture.element.querySelector('.goblin-terminal-output-cursor-proxy')).toBeNull()
    stabilizer.dispose()
  })
})
