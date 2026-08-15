import { describe, expect, test, vi } from 'vitest'
import {
  registerTerminalOsc52ClipboardHandler,
  terminalTextForOsc52Payload,
} from '#/web/components/terminal/terminal-osc52-clipboard.ts'

function base64Utf8(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
}

describe('terminalTextForOsc52Payload', () => {
  test('decodes base64 utf-8 text after the selection parameter', () => {
    expect(terminalTextForOsc52Payload(`c;${base64Utf8('copied text')}`)).toBe('copied text')
    expect(terminalTextForOsc52Payload(`c;${base64Utf8('终端复制')}`)).toBe('终端复制')
  })

  test('decodes payloads without a selection parameter', () => {
    expect(terminalTextForOsc52Payload(base64Utf8('plain'))).toBe('plain')
  })

  test('tolerates whitespace inside the base64 data', () => {
    const wrapped = base64Utf8('wrapped payload').replace(/(.{4})/gu, '$1\n')
    expect(terminalTextForOsc52Payload(`c;${wrapped}`)).toBe('wrapped payload')
  })

  test('ignores clipboard read-back queries', () => {
    expect(terminalTextForOsc52Payload('c;?')).toBeNull()
    expect(terminalTextForOsc52Payload('?')).toBeNull()
  })

  test('ignores invalid base64 data', () => {
    expect(terminalTextForOsc52Payload('c;not*base64!')).toBeNull()
  })
})

describe('registerTerminalOsc52ClipboardHandler', () => {
  function fakeTerm() {
    const captured: { ident: number | null; handler: ((data: string) => boolean) | null } = {
      ident: null,
      handler: null,
    }
    const dispose = vi.fn()
    const term = {
      parser: {
        registerOscHandler: vi.fn((ident: number, handler: (data: string) => boolean) => {
          captured.ident = ident
          captured.handler = handler
          return { dispose }
        }),
      },
    }
    return { term, captured, dispose }
  }

  test('registers an OSC 52 handler that writes decoded text to the clipboard', () => {
    const { term, captured } = fakeTerm()
    const writeClipboardText = vi.fn()

    const disposable = registerTerminalOsc52ClipboardHandler(term, writeClipboardText)

    expect(captured.ident).toBe(52)
    expect(captured.handler?.(`c;${base64Utf8('via osc 52')}`)).toBe(true)
    expect(writeClipboardText).toHaveBeenCalledWith('via osc 52')
    expect(disposable.dispose).toBeTypeOf('function')
  })

  test('consumes queries and invalid payloads without writing to the clipboard', () => {
    const { term, captured } = fakeTerm()
    const writeClipboardText = vi.fn()

    registerTerminalOsc52ClipboardHandler(term, writeClipboardText)

    expect(captured.handler?.('c;?')).toBe(true)
    expect(captured.handler?.('c;not*base64!')).toBe(true)
    expect(writeClipboardText).not.toHaveBeenCalled()
  })
})
