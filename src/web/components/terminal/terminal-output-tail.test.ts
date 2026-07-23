import { describe, expect, test, vi } from 'vitest'
import { createTerminalOutputTail } from '#/web/components/terminal/terminal-output-tail.ts'

describe('terminal output tail', () => {
  test('keeps at most 4096 Unicode code points by default', () => {
    const tail = createTerminalOutputTail()
    tail.push(`${'a'.repeat(4096)}🙂end`)
    expect(Array.from(tail.value())).toHaveLength(4096)
    expect(tail.value()).toMatch(/🙂end$/u)
  })

  test('trims one large output chunk only once after parsing', () => {
    const slice = vi.spyOn(Array.prototype, 'slice')
    try {
      const tail = createTerminalOutputTail()

      tail.push('a'.repeat(10_000))

      expect(slice).toHaveBeenCalledTimes(1)
      expect(tail.value()).toHaveLength(4096)
    } finally {
      slice.mockRestore()
    }
  })

  test('keeps only the final Unicode code points', () => {
    const tail = createTerminalOutputTail(5)
    tail.push('a🙂bcde')
    expect(tail.value()).toBe('🙂bcde')
  })

  test('removes ANSI and OSC sequences split across chunks', () => {
    const tail = createTerminalOutputTail()
    tail.push('\u001b[3')
    tail.push('1mred\u001b]0;secret')
    tail.push(' title\u001b\\plain\u001b[0m')
    expect(tail.value()).toBe('redplain')
  })

  test('collapses whitespace across chunks before applying the character limit', () => {
    const tail = createTerminalOutputTail(8)
    tail.push(`one${' '.repeat(5_000)}\t\r\n`)
    tail.push('  two')
    expect(tail.value()).toBe('one two')
  })

  test('compacts a long horizontal rule across chunks before applying the character limit', () => {
    const tail = createTerminalOutputTail(20)
    tail.push(`before ${'─'.repeat(5_000)}`)
    tail.push(`${'─'.repeat(5_000)} after`)
    expect(tail.value()).toBe('before ─── after')
  })

  test('normalizes carriage returns and removes non-display controls', () => {
    const tail = createTerminalOutputTail()
    tail.push('one\r\ntwo\rthree\t four\u0000\u0007')
    expect(tail.value()).toBe('one two three four')
  })

  test('resets text and parser state', () => {
    const tail = createTerminalOutputTail()
    tail.push('before\u001b[')
    tail.reset()
    tail.push('after')
    expect(tail.value()).toBe('after')
  })
})
