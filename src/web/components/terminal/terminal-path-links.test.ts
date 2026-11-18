// @vitest-environment jsdom

import { Terminal } from '@xterm/headless'
import { describe, expect, test, vi } from 'vitest'
import type { ILink, ILinkProvider } from '@xterm/xterm'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import {
  registerTerminalRelativePathLinkProvider,
  terminalFilePathAtPoint,
} from '#/web/components/terminal/terminal-path-links.ts'

test('hit-tests the scrolled terminal buffer across wide characters, padding and wrapped paths', async () => {
  const term = new Terminal({ cols: 20, rows: 2, allowProposedApi: true })
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  const element = document.createElement('div')
  element.appendChild(screen)
  vi.spyOn(screen, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 40))
  try {
    await new Promise<void>((done) => term.write('old output\r\n测 README.md docs/other.md', done))
    expect(term.buffer.active.viewportY).toBe(1)
    const target = (column: number, row: number) =>
      terminalFilePathAtPoint(
        { buffer: term.buffer, cols: term.cols, rows: term.rows, element },
        { clientX: 11 + column * 10, clientY: 21 + row * 20 },
        '/repo',
      )
    expect(target(1, 0)).toBeNull()
    expect(target(3, 0)).toEqual({ path: 'README.md' })
    expect(target(12, 0)).toBeNull()
    expect(target(13, 0)).toEqual({ path: 'docs/other.md' })
    expect(target(1, 1)).toEqual({ path: 'docs/other.md' })
    expect(target(15, 1)).toBeNull()
    expect(target(-1, 0)).toBeNull()
  } finally {
    term.dispose()
  }
})

describe('registerTerminalRelativePathLinkProvider', () => {
  function pathLink({
    reveal = vi.fn(),
    editor = vi.fn(),
    text = 'created src/app.ts:12:3',
    worktree = null,
    onHover = () => {},
  }: {
    reveal?: ((path: string) => void) | null
    editor?: ((target: FilePathTarget) => void) | null
    text?: string
    worktree?: string | null
    onHover?: (target: FilePathTarget | null) => void
  } = {}): ILink[] | undefined {
    let provider: ILinkProvider | undefined
    registerTerminalRelativePathLinkProvider(
      {
        buffer: { active: { getLine: () => ({ translateToString: () => text }) } },
        registerLinkProvider: (nextProvider) => {
          provider = nextProvider
          return { dispose: vi.fn() }
        },
      },
      () => reveal,
      () => editor,
      () => worktree,
      onHover,
    )
    let links: ILink[] | undefined
    provider?.provideLinks(1, (provided) => {
      links = provided
    })
    return links
  }

  test('reports the structured path while the pointer is over a link', () => {
    const onHover = vi.fn()
    const link = pathLink({ onHover })?.[0]
    expect(link).toBeDefined()
    link!.hover?.({} as MouseEvent, link!.text)
    expect(onHover).toHaveBeenLastCalledWith({ path: 'src/app.ts', line: 12, column: 3 })
    link!.leave?.({} as MouseEvent, link!.text)
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  test.each([
    'README',
    './README',
    'LICENSE',
    'Dockerfile',
    'Makefile',
    '.env',
    '.env.local',
    '.gitignore',
    '.editorconfig',
  ])('reveals the known root document %s on single click', (path) => {
    const reveal = vi.fn()
    const editor = vi.fn()
    const link = pathLink({ text: `created ${path}`, reveal, editor })![0]!
    link.activate({ button: 0, detail: 1 } as MouseEvent, link.text)
    expect(reveal).toHaveBeenCalledExactlyOnceWith(path.replace(/^\.\//u, ''))
    expect(editor).not.toHaveBeenCalled()
  })

  test.each(['/tmp/report.md', 'C:\\reports\\guide.md'])('only opens the external link %s on double click', (path) => {
    const reveal = vi.fn()
    const editor = vi.fn()
    const link = pathLink({ text: path, worktree: '/repo', reveal, editor })![0]!
    link.activate({ button: 0, detail: 1 } as MouseEvent, link.text)
    expect(reveal).not.toHaveBeenCalled()
    expect(editor).not.toHaveBeenCalled()
    link.activate({ button: 0, detail: 2 } as MouseEvent, link.text)
    expect(editor).toHaveBeenCalledExactlyOnceWith({ path })
  })

  test.each([1, 2])('ignores activation with mouse button %i', (button) => {
    const reveal = vi.fn()
    const editor = vi.fn()
    const link = pathLink({ reveal, editor })![0]!
    link.activate({ button, detail: 1 } as MouseEvent, link.text)
    link.activate({ button, detail: 2 } as MouseEvent, link.text)
    expect(reveal).not.toHaveBeenCalled()
    expect(editor).not.toHaveBeenCalled()
  })

  test('provides wrapped terminal path links with a cross-line range', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const lines = [
      { text: 'created src/components/', isWrapped: false },
      { text: 'TerminalView.tsx:42', isWrapped: true },
    ]
    const term = {
      buffer: {
        active: {
          getLine: (index: number) => {
            const line = lines[index]
            return line
              ? {
                  isWrapped: line.isWrapped,
                  translateToString: () => line.text,
                }
              : undefined
          },
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }
    const reveal = vi.fn()

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => null,
    )

    let provided:
      | Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          text: string
          activate: (event: MouseEvent, text: string) => void
        }>
      | undefined
    captured.provider?.provideLinks(2, (links) => {
      provided = links as typeof provided
    })

    expect(provided?.[0]).toMatchObject({
      text: 'src/components/TerminalView.tsx:42',
      range: { start: { x: 9, y: 1 }, end: { x: 19, y: 2 } },
    })
    provided?.[0]?.activate({ button: 0, detail: 1 } as MouseEvent, 'src/components/TerminalView.tsx:42')
    expect(reveal).toHaveBeenCalledWith('src/components/TerminalView.tsx')
  })

  test.each(['/tmp/reports/', 'C:\\reports\\'])(
    'captures hard-wrapped absolute links for the context menu across terminal buffer rows: %s',
    (prefix) => {
      const captured: { provider?: ILinkProvider } = {}
      const lines = [`created ${prefix}`, 'report.md:4']
      const onHover = vi.fn()
      registerTerminalRelativePathLinkProvider(
        {
          buffer: {
            active: {
              getLine: (index) => (lines[index] === undefined ? undefined : { translateToString: () => lines[index]! }),
            },
          },
          registerLinkProvider: (provider) => {
            captured.provider = provider
            return { dispose: vi.fn() }
          },
        },
        () => null,
        () => vi.fn(),
        () => '/repo',
        onHover,
      )
      let links: ILink[] | undefined
      captured.provider?.provideLinks(2, (provided) => {
        links = provided
      })
      expect(links).toHaveLength(1)
      expect(links![0]!.range).toEqual({ start: { x: 9, y: 1 }, end: { x: 11, y: 2 } })
      links![0]!.hover?.({} as MouseEvent, links![0]!.text)
      expect(onHover).toHaveBeenCalledExactlyOnceWith({ path: `${prefix}report.md`, line: 4 })
    },
  )

  test('provides hard line break path links when a directory prefix continues on the next line', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const lines = [
      { text: 'members: backend/app/kooky_opt/', isWrapped: false },
      { text: 'one_person_team/repositories/agents.py:45, next', isWrapped: false },
    ]
    const term = {
      buffer: {
        active: {
          getLine: (index: number) => {
            const line = lines[index]
            return line
              ? {
                  isWrapped: line.isWrapped,
                  translateToString: () => line.text,
                }
              : undefined
          },
        },
      },
      registerLinkProvider: vi.fn((nextProvider: ILinkProvider) => {
        captured.provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }
    const reveal = vi.fn()
    const openPathInEditor = vi.fn()

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => openPathInEditor,
    )

    let provided:
      | Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          text: string
          activate: (event: MouseEvent, text: string) => void
        }>
      | undefined
    captured.provider?.provideLinks(2, (links) => {
      provided = links as typeof provided
    })

    expect(provided?.[0]).toMatchObject({
      text: 'backend/app/kooky_opt/\none_person_team/repositories/agents.py:45',
      range: { start: { x: 10, y: 1 }, end: { x: 41, y: 2 } },
    })

    provided?.[0]?.activate({ button: 0, detail: 1 } as MouseEvent, provided[0].text)
    expect(reveal).toHaveBeenCalledWith('backend/app/kooky_opt/one_person_team/repositories/agents.py')

    provided?.[0]?.activate({ button: 0, detail: 2 } as MouseEvent, provided[0].text)
    expect(openPathInEditor).toHaveBeenCalledWith({
      path: 'backend/app/kooky_opt/one_person_team/repositories/agents.py',
      line: 45,
    })
  })

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

    const registration = registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => null,
    )

    expect(term.registerLinkProvider).toHaveBeenCalledTimes(1)
    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })
    expect(provided?.[0]?.text).toBe('src/app.ts:12')

    provided?.[0]?.activate({ button: 0, detail: 1 } as MouseEvent, 'src/app.ts:12')

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

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => openPathInEditor,
    )

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    provided?.[0]?.activate({ button: 0, detail: 2 } as MouseEvent, 'src/app.ts:12:3')

    expect(reveal).not.toHaveBeenCalled()
    expect(openPathInEditor).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('reveals relative path but opens absolute editor target for contained Windows links', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: () => ({
            translateToString: () => 'created C:\\repo\\src\\app.ts:12:3',
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

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => openPathInEditor,
      () => 'C:\\repo',
    )

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    provided?.[0]?.activate({ button: 0, detail: 1 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
    expect(reveal).toHaveBeenCalledWith('src/app.ts')

    provided?.[0]?.activate({ button: 0, detail: 2 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
    expect(openPathInEditor).toHaveBeenCalledWith({ path: 'C:\\repo\\src\\app.ts', line: 12, column: 3 })
  })

  test('activates structured targets for traceback-style terminal path links', () => {
    const captured: { provider: ILinkProvider | null } = { provider: null }
    const term = {
      buffer: {
        active: {
          getLine: () => ({
            translateToString: () => 'File "backend/app/main.py", line 42, in run',
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

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => openPathInEditor,
    )

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    expect(provided?.[0]?.text).toBe('backend/app/main.py", line 42')
    provided?.[0]?.activate({ button: 0, detail: 2 } as MouseEvent, 'backend/app/main.py", line 42')

    expect(openPathInEditor).toHaveBeenCalledWith({ path: 'backend/app/main.py', line: 42 })
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

    registerTerminalRelativePathLinkProvider(
      term,
      () => null,
      () => null,
    )

    let provided: unknown[] | undefined = []
    captured.provider?.provideLinks(1, (links) => {
      provided = links
    })
    expect(provided).toBeUndefined()
  })
})
