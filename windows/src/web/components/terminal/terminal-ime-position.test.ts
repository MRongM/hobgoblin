// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import { stabilizeTerminalImePosition } from './terminal-ime-position.ts'

function terminalFixture() {
  const element = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  screen.style.width = '1200px'
  screen.style.height = '600px'
  const textarea = document.createElement('textarea')
  const compositionView = document.createElement('div')
  compositionView.className = 'composition-view'
  screen.append(textarea, compositionView)
  element.append(screen)

  textarea.addEventListener('compositionstart', () => compositionView.classList.add('active'))
  textarea.addEventListener('compositionend', () => compositionView.classList.remove('active'))
  textarea.addEventListener(
    'keydown',
    (event) => {
      if (!compositionView.classList.contains('active')) return
      if ([16, 17, 18, 20, 229].includes(event.keyCode)) return
      if (event.ctrlKey && event.key.toLowerCase() === 'v') return
      compositionView.classList.remove('active')
    },
    true,
  )
  const cursor = { cursorX: 1, cursorY: 1 }

  const renderListeners = new Set<() => void>()
  const terminal = {
    element,
    textarea,
    cols: 100,
    rows: 25,
    buffer: {
      active: cursor,
    },
    onRender(listener: () => void) {
      renderListeners.add(listener)
      return { dispose: () => renderListeners.delete(listener) }
    },
  } as unknown as XTermTerminal

  return {
    compositionView,
    cursor,
    element,
    render: () => {
      for (const listener of renderListeners) listener()
    },
    screen,
    terminal,
    textarea,
  }
}

function moveImeElements(textarea: HTMLTextAreaElement, compositionView: HTMLElement, left: number, top: number): void {
  textarea.style.left = `${left}px`
  textarea.style.top = `${top}px`
  compositionView.style.left = `${left}px`
  compositionView.style.top = `${top}px`
}

function expectImeAnchor(textarea: HTMLTextAreaElement, compositionView: HTMLElement, left: string, top: string): void {
  for (const element of [textarea, compositionView]) {
    expect(element.classList.contains('goblin-terminal-ime-anchor')).toBe(true)
    expect(element.style.getPropertyValue('--goblin-terminal-ime-anchor-left')).toBe(left)
    expect(element.style.getPropertyValue('--goblin-terminal-ime-anchor-top')).toBe(top)
  }
}

function expectNoImeAnchor(textarea: HTMLTextAreaElement, compositionView: HTMLElement): void {
  for (const element of [textarea, compositionView]) {
    expect(element.classList.contains('goblin-terminal-ime-anchor')).toBe(false)
    expect(element.style.getPropertyValue('--goblin-terminal-ime-anchor-left')).toBe('')
    expect(element.style.getPropertyValue('--goblin-terminal-ime-anchor-top')).toBe('')
  }
}

describe('stabilizeTerminalImePosition', () => {
  test('locks the Windows TSF candidate anchor when the IME consumes printable keydown', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
    moveImeElements(fixture.textarea, fixture.compositionView, 896, 658)

    expectImeAnchor(fixture.textarea, fixture.compositionView, '84px', '168px')
    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['896px', '658px'])

    disposable.dispose()
  })

  test('does not lock ordinary Windows input with a matching keydown and keyup', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))

    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('does not lock ordinary Windows input when xterm consumes keydown before the adapter', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new InputEvent('beforeinput', { data: 'x', inputType: 'insertText' }))
    fixture.textarea.dispatchEvent(new InputEvent('input', { data: 'x', inputType: 'insertText' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))

    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('reanchors the next opaque Windows TSF phrase after committed input advances the cursor', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
    fixture.textarea.dispatchEvent(new InputEvent('beforeinput', { data: 'committed', inputType: 'insertText' }))
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    moveImeElements(fixture.textarea, fixture.compositionView, 112, 168)
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))

    expectImeAnchor(fixture.textarea, fixture.compositionView, '112px', '168px')

    disposable.dispose()
  })

  test('releases an opaque Windows TSF anchor on normal keydown without relocking on keyup', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', key: 'a' }))

    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('keeps an opaque Windows TSF anchor across Process keydown sequences', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'z' }))
    moveImeElements(fixture.textarea, fixture.compositionView, 896, 658)
    const processKeyDown = new KeyboardEvent('keydown', { key: 'Process' })
    Object.defineProperty(processKeyDown, 'keyCode', { configurable: true, value: 229 })
    fixture.textarea.dispatchEvent(processKeyDown)
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'Process' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'h' }))

    expectImeAnchor(fixture.textarea, fixture.compositionView, '84px', '168px')

    disposable.dispose()
  })

  test('replaces the drifting xterm cursor with a proxy at the opaque IME anchor', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { key: 'z' }))
    const cursorProxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-ime-cursor-proxy')

    expect(fixture.element.classList.contains('goblin-terminal-ime-cursor-anchored')).toBe(true)
    expect(cursorProxy?.classList.contains('is-active')).toBe(true)
    expect([cursorProxy?.style.left, cursorProxy?.style.top, cursorProxy?.style.height]).toEqual([
      '84px',
      '168px',
      '24px',
    ])

    moveImeElements(fixture.textarea, fixture.compositionView, 896, 658)
    const driftingCursor = document.createElement('span')
    driftingCursor.className = 'xterm-cursor xterm-cursor-bar'
    fixture.screen.append(driftingCursor)

    expect([cursorProxy?.style.left, cursorProxy?.style.top]).toEqual(['84px', '168px'])

    fixture.textarea.dispatchEvent(new InputEvent('beforeinput', { data: 'committed', inputType: 'insertText' }))
    expect(fixture.element.classList.contains('goblin-terminal-ime-cursor-anchored')).toBe(false)
    expect(cursorProxy?.classList.contains('is-active')).toBe(false)

    disposable.dispose()
    expect(cursorProxy?.isConnected).toBe(false)
  })

  test('keeps xterm native cursor rendering during standard composition', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    const cursorProxy = fixture.element.querySelector<HTMLElement>('.goblin-terminal-ime-cursor-proxy')

    expect(fixture.element.classList.contains('goblin-terminal-ime-cursor-anchored')).toBe(false)
    expect(cursorProxy?.classList.contains('is-active')).toBe(false)
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
  })

  test('keeps an opaque Windows TSF anchor for Backspace and releases it for Escape', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'Backspace', key: 'Backspace' }))
    expect(fixture.textarea.classList.contains('goblin-terminal-ime-anchor')).toBe(true)

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }))
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('keeps the IME anchor at composition start while terminal renders move the cursor', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    let renderPosition = { left: 180, top: 36 }
    fixture.terminal.onRender(() => {
      const { left, top } = renderPosition
      moveImeElements(fixture.textarea, fixture.compositionView, left, top)
      window.setTimeout(() => moveImeElements(fixture.textarea, fixture.compositionView, left, top), 0)
    })
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    fixture.render()
    vi.runAllTimers()
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    renderPosition = { left: 520, top: 72 }
    fixture.render()
    vi.runAllTimers()
    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['520px', '72px'])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
    vi.useRealTimers()
  })

  test('computes the first composition anchor without relying on stale textarea styles', () => {
    const fixture = terminalFixture()
    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['', ''])
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['', ''])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
  })

  test('recomputes the composition anchor from current screen dimensions and cursor after resize', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    fixture.textarea.dispatchEvent(new CompositionEvent('compositionend'))
    fixture.screen.style.width = '800px'
    fixture.screen.style.height = '400px'
    fixture.cursor.cursorX = 30
    fixture.cursor.cursorY = 12
    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))

    expectImeAnchor(fixture.textarea, fixture.compositionView, '240px', '192px')

    disposable.dispose()
  })

  test('keeps the CSS anchor after xterm delayed composition updates', () => {
    vi.useFakeTimers()
    const fixture = terminalFixture()
    fixture.textarea.addEventListener('compositionupdate', () => {
      window.setTimeout(() => moveImeElements(fixture.textarea, fixture.compositionView, 640, 96), 0)
    })
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    fixture.textarea.dispatchEvent(new CompositionEvent('compositionupdate', { data: '中文' }))
    vi.runAllTimers()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['640px', '96px'])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
    vi.useRealTimers()
  })

  test('keeps the CSS anchor while xterm mutates ordinary inline position', async () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    moveImeElements(fixture.textarea, fixture.compositionView, 640, 96)
    await Promise.resolve()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['640px', '96px'])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
  })

  test('releases the anchor when composition ends', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    fixture.textarea.dispatchEvent(new CompositionEvent('compositionend', { data: '中文' }))
    moveImeElements(fixture.textarea, fixture.compositionView, 320, 64)
    fixture.render()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['320px', '64px'])
    expect([fixture.compositionView.style.left, fixture.compositionView.style.top]).toEqual(['320px', '64px'])
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('releases the anchor when xterm finalizes composition from a normal keydown', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    const keydown = new KeyboardEvent('keydown', { key: 'Enter' })
    Object.defineProperty(keydown, 'keyCode', { configurable: true, value: 13 })
    fixture.textarea.dispatchEvent(keydown)
    moveImeElements(fixture.textarea, fixture.compositionView, 320, 64)
    fixture.render()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['320px', '64px'])
    expect([fixture.compositionView.style.left, fixture.compositionView.style.top]).toEqual(['320px', '64px'])
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('cleans standard composition state when keydown finalizes before an anchor can be measured', () => {
    const fixture = terminalFixture()
    fixture.screen.style.width = ''
    fixture.screen.style.height = ''
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    const keydown = new KeyboardEvent('keydown', { key: 'Enter' })
    Object.defineProperty(keydown, 'keyCode', { configurable: true, value: 13 })
    fixture.textarea.dispatchEvent(keydown)

    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    disposable.dispose()
  })

  test('keeps the anchor when xterm custom key handling vetoes composition finalization', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    const keydown = new KeyboardEvent('keydown', { ctrlKey: true, key: 'v' })
    Object.defineProperty(keydown, 'keyCode', { configurable: true, value: 86 })
    fixture.textarea.dispatchEvent(keydown)
    moveImeElements(fixture.textarea, fixture.compositionView, 320, 64)
    fixture.render()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['320px', '64px'])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
  })

  test.each([16, 17, 18, 20, 229])('keeps the anchor for xterm composition keyCode %i', (keyCode) => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    const keydown = new KeyboardEvent('keydown')
    Object.defineProperty(keydown, 'keyCode', { configurable: true, value: keyCode })
    fixture.textarea.dispatchEvent(keydown)
    moveImeElements(fixture.textarea, fixture.compositionView, 320, 64)
    fixture.render()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['320px', '64px'])
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
  })

  test('does not alter xterm composition positioning on non-Windows platforms', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'MacIntel')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    moveImeElements(fixture.textarea, fixture.compositionView, 320, 64)
    fixture.render()

    expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['320px', '64px'])
    expect([fixture.compositionView.style.left, fixture.compositionView.style.top]).toEqual(['320px', '64px'])

    disposable.dispose()
  })

  test('removes opaque Windows TSF anchor state on blur and disposal', () => {
    const fixture = terminalFixture()
    moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
    fixture.textarea.dispatchEvent(new FocusEvent('blur'))
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
    disposable.dispose()
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)

    fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', key: 'n' }))
    expectNoImeAnchor(fixture.textarea, fixture.compositionView)
  })

  test('does not lock xterm composition width', () => {
    const fixture = terminalFixture()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    fixture.textarea.style.width = '140px'
    fixture.compositionView.style.width = '126px'

    expect(fixture.textarea.style.width).toBe('140px')
    expect(fixture.compositionView.style.width).toBe('126px')
    expect(fixture.textarea.style.getPropertyValue('--goblin-terminal-ime-anchor-width')).toBe('')

    disposable.dispose()
  })

  test('keeps focus and native composition events active while locking position', () => {
    const fixture = terminalFixture()
    document.body.appendChild(fixture.element)
    fixture.textarea.focus()
    const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

    fixture.textarea.dispatchEvent(new CompositionEvent('compositionstart'))
    moveImeElements(fixture.textarea, fixture.compositionView, 180, 36)
    const update = new CompositionEvent('compositionupdate', { cancelable: true, data: '中文' })
    fixture.textarea.dispatchEvent(update)

    expect(document.activeElement).toBe(fixture.textarea)
    expect(update.defaultPrevented).toBe(false)
    expectImeAnchor(fixture.textarea, fixture.compositionView, '12px', '24px')

    disposable.dispose()
    fixture.element.remove()
  })
})
