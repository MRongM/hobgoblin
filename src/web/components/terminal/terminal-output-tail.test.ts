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

  test('consumes charset designators split across chunks without leaking final bytes', () => {
    const tail = createTerminalOutputTail()
    tail.push('left\u001b(')
    tail.push('Bright')
    expect(tail.value()).toBe('leftright')
  })

  test('adds a text boundary for cursor commands but not SGR styling', () => {
    const tail = createTerminalOutputTail()
    tail.push('first\u001b[2;1Hsecond\u001b[31mred\u001b[0mtext')
    expect(tail.value()).toBe('first secondredtext')
  })

  test('removes DCS, SOS, PM, and APC string controls split across chunks', () => {
    const tail = createTerminalOutputTail()
    tail.push('one\u001bPdrop\u001b')
    tail.push('\\two\u001bXdrop\u001b\\three\u001b^drop\u001b\\four\u001b_drop\u001b\\five')
    tail.push('\u0090drop\u009csix\u0098drop\u009cseven\u009edrop\u009ceight\u009fdrop\u009cnine')
    expect(tail.value()).toBe('onetwothreefourfivesixseveneightnine')
  })

  test('resumes visible text after CAN or SUB cancels an in-flight control', () => {
    const tail = createTerminalOutputTail()
    tail.push('one\u001bPdrop\u0018two\u001b]drop\u001athree')
    expect(tail.value()).toBe('onetwothree')
  })

  test('projects DEC Special Graphics without leaking raw glyph bytes', () => {
    const tail = createTerminalOutputTail()
    tail.push('\u001b(0lqqqqk\u001b(B text')
    expect(tail.value()).toBe('─── text')
  })

  test('selects G1 DEC Special Graphics with SO and returns to G0 with SI', () => {
    const tail = createTerminalOutputTail()
    tail.push('\u001b)0\u000eg\u000fq')
    expect(tail.value()).toBe('±q')
  })

  test('turns direct Unicode frame edges into boundaries before applying the limit', () => {
    const tail = createTerminalOutputTail()
    tail.push('╭────╮\n│ OpenAI Codex │\n╰────╯ --flag ± plain')
    expect(tail.value()).toBe('─── OpenAI Codex ─── --flag ± plain')
  })

  test('removes repeated charset designators from framed TUI output', () => {
    const tail = createTerminalOutputTail()
    tail.push('\u001b(B╭────╮\u001b(B│ >_ \u001b(BOpenAI Codex\u001b(B │\u001b(B╰────╯')
    expect(tail.value()).toBe('─── >_ OpenAI Codex ───')
  })

  test('resets string-control and character-set state', () => {
    const tail = createTerminalOutputTail()
    tail.push('\u001bPdrop')
    tail.reset()
    tail.push('\u001b(0q')
    expect(tail.value()).toBe('─')

    tail.reset()
    tail.push('q')
    expect(tail.value()).toBe('q')
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
