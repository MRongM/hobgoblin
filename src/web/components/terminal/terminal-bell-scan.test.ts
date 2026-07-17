import { describe, expect, test } from 'vitest'
import { createTerminalBellScanner } from '#/web/components/terminal/terminal-bell-scan.ts'

describe('createTerminalBellScanner', () => {
  test('detects a plain BEL ring', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('build finished\x07')).toBe(true)
    expect(scanner.scan('no ring here')).toBe(false)
  })

  test('ignores BEL used as OSC terminator (title updates)', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b]0;my title\x07')).toBe(false)
    expect(scanner.scan('\x1b]2;another\x07plain text')).toBe(false)
  })

  test('detects a ring after an ST-terminated OSC', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b]0;my title\x1b\\done\x07')).toBe(true)
  })

  test('keeps sequence state across output chunks', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b]0;split ti')).toBe(false)
    expect(scanner.scan('tle\x07')).toBe(false)
    expect(scanner.scan('\x07')).toBe(true)
  })

  test('ignores BEL inside DCS payloads and resumes after ST', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1bPq#0;\x07;sixel-data\x1b\\')).toBe(false)
    expect(scanner.scan('\x07')).toBe(true)
  })

  test('handles C1 OSC and ST forms', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\u009d0;title\x07')).toBe(false)
    expect(scanner.scan('\u009d0;title\u009c\x07')).toBe(true)
  })

  test('counts BEL after CSI sequences like xterm does', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b[31mred\x07')).toBe(true)
  })

  test('an escape cancelling a string payload is reprocessed as introducer', () => {
    const scanner = createTerminalBellScanner()
    // ESC inside the OSC payload starts a new OSC; its BEL terminator must not ring.
    expect(scanner.scan('\x1b]0;abc\x1b]0;def\x07')).toBe(false)
    expect(scanner.scan('\x07')).toBe(true)
  })

  test('CAN aborts a dangling DCS so later rings are not swallowed', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1bPq;sixel-data-cut-off')).toBe(false)
    expect(scanner.scan('\x18')).toBe(false)
    expect(scanner.scan('\x07')).toBe(true)
  })

  test('SUB aborts an OSC payload; the trailing BEL rings', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b]0;title\x1a\x07')).toBe(true)
  })

  test('CAN aborts escape and string-escape states', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b\x18\x07')).toBe(true)
    expect(scanner.scan('\x1bPdata\x1b\x18\x07')).toBe(true)
  })

  test('CAN/SUB in normal state are inert', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x18\x1aplain')).toBe(false)
    expect(scanner.scan('\x1b]0;title\x07')).toBe(false)
  })

  test('reset clears mid-sequence state', () => {
    const scanner = createTerminalBellScanner()
    expect(scanner.scan('\x1b]0;dangling')).toBe(false)
    scanner.reset()
    expect(scanner.scan('\x07')).toBe(true)
  })
})
