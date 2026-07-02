import { describe, expect, test, vi } from 'vitest'
import type { ILinkProvider } from '@xterm/xterm'
import {
  registerTerminalLocalUrlLinkProvider,
  terminalLocalUrlLinksForLine,
} from '#/web/components/terminal/terminal-local-url-links.ts'

describe('terminalLocalUrlLinksForLine', () => {
  test('recognizes protocol-less localhost and loopback urls', () => {
    expect(terminalLocalUrlLinksForLine('ready at localhost:5173 and 127.0.0.1:61888/path?x=1')).toEqual([
      { text: 'localhost:5173', url: 'http://localhost:5173/', startColumn: 10, endColumn: 23 },
      { text: '127.0.0.1:61888/path?x=1', url: 'http://127.0.0.1:61888/path?x=1', startColumn: 29, endColumn: 52 },
    ])
  })

  test('rejects invalid localhost-like candidates', () => {
    expect(terminalLocalUrlLinksForLine('skip localhost:99999 and example.com:3000 and localhost:abc')).toEqual([])
  })
})

describe('registerTerminalLocalUrlLinkProvider', () => {
  test('opens normalized local urls with the current modifier-click handler', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: (index: number) =>
            index === 0
              ? {
                  translateToString: () => 'ready at localhost:5173/app',
                }
              : undefined,
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }
    const openUrl = vi.fn()

    registerTerminalLocalUrlLinkProvider(term, () => openUrl)

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    expect(provided?.[0]?.text).toBe('localhost:5173/app')
    provided?.[0]?.activate({ ctrlKey: false, metaKey: false } as MouseEvent, 'localhost:5173/app')
    expect(openUrl).not.toHaveBeenCalled()

    provided?.[0]?.activate({ ctrlKey: true, metaKey: false } as MouseEvent, 'localhost:5173/app')
    expect(openUrl).toHaveBeenCalledWith('http://localhost:5173/app')
  })
})
