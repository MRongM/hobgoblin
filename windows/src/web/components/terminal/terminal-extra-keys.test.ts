import { describe, expect, test } from 'vitest'
import { TERMINAL_EXTRA_KEY_ROWS, terminalInputForExtraKey } from '#/web/components/terminal/terminal-extra-keys.ts'

describe('terminal extra keys', () => {
  test('keeps the Android Termux-compatible two-row order', () => {
    expect(TERMINAL_EXTRA_KEY_ROWS.map((row) => row.map((key) => key.label))).toEqual([
      ['ESC', '/', '-', 'HOME', '↑', 'END', 'PGUP'],
      ['TAB', 'CTRL', 'ALT', '←', '↓', '→', 'PGDN'],
    ])
  })

  test('uses normal and application cursor sequences', () => {
    expect(
      terminalInputForExtraKey(
        { key: 'arrow-up', ctrlPressed: false, altPressed: false },
        { applicationCursorKeysMode: false },
      ),
    ).toBe('\x1b[A')
    expect(
      terminalInputForExtraKey(
        { key: 'arrow-up', ctrlPressed: false, altPressed: false },
        { applicationCursorKeysMode: true },
      ),
    ).toBe('\x1bOA')
    expect(
      terminalInputForExtraKey(
        { key: 'home', ctrlPressed: false, altPressed: false },
        { applicationCursorKeysMode: true },
      ),
    ).toBe('\x1bOH')
    expect(
      terminalInputForExtraKey(
        { key: 'end', ctrlPressed: false, altPressed: false },
        { applicationCursorKeysMode: true },
      ),
    ).toBe('\x1bOF')
  })

  test('encodes Ctrl and Alt modifiers for navigation keys', () => {
    expect(
      terminalInputForExtraKey(
        { key: 'arrow-up', ctrlPressed: true, altPressed: false },
        { applicationCursorKeysMode: true },
      ),
    ).toBe('\x1b[1;5A')
    expect(
      terminalInputForExtraKey(
        { key: 'arrow-right', ctrlPressed: false, altPressed: true },
        { applicationCursorKeysMode: false },
      ),
    ).toBe('\x1b[1;3C')
    expect(
      terminalInputForExtraKey(
        { key: 'page-up', ctrlPressed: true, altPressed: true },
        { applicationCursorKeysMode: false },
      ),
    ).toBe('\x1b[5;7~')
  })

  test('encodes text, paging, and Android-compatible control punctuation', () => {
    const normalMode = { applicationCursorKeysMode: false }
    expect(terminalInputForExtraKey({ key: 'page-down', ctrlPressed: false, altPressed: false }, normalMode)).toBe(
      '\x1b[6~',
    )
    expect(terminalInputForExtraKey({ key: 'slash', ctrlPressed: true, altPressed: false }, normalMode)).toBe('\x1f')
    expect(terminalInputForExtraKey({ key: 'minus', ctrlPressed: true, altPressed: false }, normalMode)).toBe('\x1f')
    expect(terminalInputForExtraKey({ key: 'minus', ctrlPressed: false, altPressed: true }, normalMode)).toBe('\x1b-')
    expect(terminalInputForExtraKey({ key: 'tab', ctrlPressed: false, altPressed: true }, normalMode)).toBe('\x1b\t')
  })
})
