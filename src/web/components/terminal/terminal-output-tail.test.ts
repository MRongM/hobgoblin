import { describe, expect, test } from 'vitest'
import { createTerminalOutputTail } from '#/web/components/terminal/terminal-output-tail.ts'

describe('terminal output tail', () => {
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

  test('normalizes carriage returns and removes non-display controls', () => {
    const tail = createTerminalOutputTail()
    tail.push('one\r\ntwo\rthree\u0000\u0007')
    expect(tail.value()).toBe('one\ntwo\nthree')
  })

  test('resets text and parser state', () => {
    const tail = createTerminalOutputTail()
    tail.push('before\u001b[')
    tail.reset()
    tail.push('after')
    expect(tail.value()).toBe('after')
  })
})
