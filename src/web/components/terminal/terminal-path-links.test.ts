import { describe, expect, test, vi } from 'vitest'
import type { ILinkProvider } from '@xterm/xterm'
import {
  normalizeTerminalRelativePath,
  registerTerminalRelativePathLinkProvider,
  terminalRelativePathLinksForLine,
} from '#/web/components/terminal/terminal-path-links.ts'

describe('normalizeTerminalRelativePath', () => {
  test('accepts worktree-relative paths', () => {
    expect(normalizeTerminalRelativePath('src/app.ts')).toBe('src/app.ts')
    expect(normalizeTerminalRelativePath('./src/app.ts')).toBe('src/app.ts')
    expect(normalizeTerminalRelativePath('"docs/guide.md",')).toBe('docs/guide.md')
  })

  test('strips line and column suffixes', () => {
    expect(normalizeTerminalRelativePath('src/app.ts:12')).toBe('src/app.ts')
    expect(normalizeTerminalRelativePath('src/app.ts:12:3')).toBe('src/app.ts')
  })

  test('rejects unsafe or non-relative paths', () => {
    expect(normalizeTerminalRelativePath('')).toBeNull()
    expect(normalizeTerminalRelativePath('https://example.com/src/app.ts')).toBeNull()
    expect(normalizeTerminalRelativePath('/repo/src/app.ts')).toBeNull()
    expect(normalizeTerminalRelativePath('C:\\repo\\src\\app.ts')).toBeNull()
    expect(normalizeTerminalRelativePath('../src/app.ts')).toBeNull()
    expect(normalizeTerminalRelativePath('src/../app.ts')).toBeNull()
  })
})

describe('terminalRelativePathLinksForLine', () => {
  test('finds path-like tokens and keeps 1-based terminal columns', () => {
    expect(terminalRelativePathLinksForLine('created src/app.ts:12 and ./docs/guide.md')).toEqual([
      { text: 'src/app.ts:12', relativePath: 'src/app.ts', startColumn: 9, endColumn: 21 },
      { text: './docs/guide.md', relativePath: 'docs/guide.md', startColumn: 27, endColumn: 41 },
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

    const registration = registerTerminalRelativePathLinkProvider(term, () => reveal)

    expect(term.registerLinkProvider).toHaveBeenCalledTimes(1)
    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })
    expect(provided?.[0]?.text).toBe('src/app.ts:12')

    provided?.[0]?.activate({} as MouseEvent, 'src/app.ts:12')

    expect(reveal).toHaveBeenCalledWith('src/app.ts')
    registration.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
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

    registerTerminalRelativePathLinkProvider(term, () => null)

    let provided: unknown[] | undefined = []
    captured.provider?.provideLinks(1, (links) => {
      provided = links
    })
    expect(provided).toBeUndefined()
  })
})
