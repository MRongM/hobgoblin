import { describe, expect, test, vi } from 'vitest'
import type { ILinkProvider } from '@xterm/xterm'
import {
  registerTerminalRelativePathLinkProvider,
  terminalRelativePathLinksForLine,
} from '#/web/components/terminal/terminal-path-links.ts'

describe('terminalRelativePathLinksForLine', () => {
  test('finds path-like tokens and keeps 1-based terminal columns', () => {
    expect(terminalRelativePathLinksForLine('created src/app.ts:12 and ./docs/guide.md')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startColumn: 9, endColumn: 21 },
      { text: './docs/guide.md', target: { path: 'docs/guide.md' }, startColumn: 27, endColumn: 41 },
    ])
  })

  test('does not link urls or absolute paths', () => {
    expect(terminalRelativePathLinksForLine('see https://example.com/a.ts and /tmp/a.ts')).toEqual([])
  })
})

describe('registerTerminalRelativePathLinkProvider', () => {
  test('registers links for the requested buffer line and activates the current reveal handler', () => {
    const dispose = vi.fn()
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: (index: number) =>
            index === 0
              ? {
                  translateToString: () => 'created src/app.ts:12',
                }
              : undefined,
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose }
      }),
    }
    const reveal = vi.fn()

    const registration = registerTerminalRelativePathLinkProvider(term, () => reveal, () => null)

    expect(term.registerLinkProvider).toHaveBeenCalledTimes(1)
    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })
    expect(provided?.[0]?.text).toBe('src/app.ts:12')

    provided?.[0]?.activate({ detail: 1 } as MouseEvent, 'src/app.ts:12')

    expect(reveal).toHaveBeenCalledWith('src/app.ts')
    registration.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('opens relative terminal path links in the editor on double click', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: () => ({
            translateToString: () => 'created src/app.ts:12:3',
          }),
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }
    const reveal = vi.fn()
    const openPathInEditor = vi.fn()

    registerTerminalRelativePathLinkProvider(term, () => reveal, () => openPathInEditor)

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    provided?.[0]?.activate({ detail: 2 } as MouseEvent, 'src/app.ts:12:3')

    expect(reveal).not.toHaveBeenCalled()
    expect(openPathInEditor).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('does not provide links when no reveal handler is attached', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: () => ({
            translateToString: () => 'created src/app.ts',
          }),
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }

    registerTerminalRelativePathLinkProvider(term, () => null, () => null)

    let provided: unknown[] | undefined = []
    captured.provider?.provideLinks(1, (links) => {
      provided = links
    })
    expect(provided).toBeUndefined()
  })
})
