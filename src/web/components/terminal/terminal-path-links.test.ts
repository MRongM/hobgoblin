import { describe, expect, test, vi } from 'vitest'
import type { ILink, ILinkProvider } from '@xterm/xterm'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { registerTerminalRelativePathLinkProvider } from '#/web/components/terminal/terminal-path-links.ts'

describe('registerTerminalRelativePathLinkProvider', () => {
  function pathLink({
    reveal = vi.fn(),
    editor = vi.fn(),
    getPreview = () => null,
    text = 'created src/app.ts:12:3',
    worktree = null,
  }: {
    reveal?: ((path: string) => void) | null
    editor?: ((target: FilePathTarget) => void) | null
    getPreview?: () => ((target: FilePathTarget) => boolean) | null
    text?: string
    worktree?: string | null
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
      getPreview,
    )
    let links: ILink[] | undefined
    provider?.provideLinks(1, (provided) => {
      links = provided
    })
    return links
  }

  test('opens a structured preview target on single click without revealing or opening the editor', () => {
    const preview = vi.fn(() => true)
    const reveal = vi.fn()
    const editor = vi.fn()
    const link = pathLink({ reveal, editor, getPreview: () => preview })?.[0]
    expect(link).toBeDefined()

    link!.activate({ detail: 1 } as MouseEvent, link!.text)

    expect(preview).toHaveBeenCalledExactlyOnceWith({ path: 'src/app.ts', line: 12, column: 3 })
    expect(reveal).not.toHaveBeenCalled()
    expect(editor).not.toHaveBeenCalled()
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
  ])('provides a preview link for known root document %s', (path) => {
    const preview = vi.fn(() => true)
    const link = pathLink({ text: `created ${path}`, getPreview: () => preview })?.[0]
    expect(link).toBeDefined()
    link!.activate({ detail: 1 } as MouseEvent, link!.text)
    expect(preview).toHaveBeenCalledExactlyOnceWith({ path: path.replace(/^\.\//u, '') })
  })

  test('reveals the relative path after preview declines a contained absolute target', () => {
    const calls: string[] = []
    const preview = vi.fn(() => {
      calls.push('preview')
      return false
    })
    const reveal = vi.fn(() => {
      calls.push('reveal')
    })
    const link = pathLink({
      reveal,
      getPreview: () => preview,
      text: 'created C:\\repo\\src\\app.ts:12:3',
      worktree: 'C:\\repo',
    })?.[0]
    expect(link).toBeDefined()

    link!.activate({ detail: 1 } as MouseEvent, link!.text)

    expect(preview).toHaveBeenCalledExactlyOnceWith({ path: 'C:\\repo\\src\\app.ts', line: 12, column: 3 })
    expect(reveal).toHaveBeenCalledExactlyOnceWith('src/app.ts')
    expect(calls).toEqual(['preview', 'reveal'])
  })

  test.each(['/tmp/report.md', 'C:\\reports\\guide.md'])(
    'previews an absolute file outside the worktree: %s',
    (path) => {
      const preview = vi.fn(() => true)
      const reveal = vi.fn()
      const editor = vi.fn()
      const link = pathLink({ text: path, worktree: '/repo', reveal, editor, getPreview: () => preview })?.[0]
      expect(link).toBeDefined()
      link!.activate({ detail: 1 } as MouseEvent, link!.text)
      expect(preview).toHaveBeenCalledExactlyOnceWith({ path })
      expect(reveal).not.toHaveBeenCalled()
      link!.activate({ detail: 2 } as MouseEvent, link!.text)
      expect(editor).toHaveBeenCalledExactlyOnceWith({ path })
    },
  )

  test('does not reveal an external absolute file when preview declines it', () => {
    const reveal = vi.fn()
    const preview = vi.fn(() => false)
    const link = pathLink({
      text: '/tmp/archive.zip',
      worktree: '/repo',
      reveal,
      getPreview: () => preview,
    })?.[0]
    expect(link).toBeDefined()
    link!.activate({ detail: 1 } as MouseEvent, link!.text)
    expect(preview).toHaveBeenCalledExactlyOnceWith({ path: '/tmp/archive.zip' })
    expect(reveal).not.toHaveBeenCalled()
  })

  test('opens only the editor on double click when a preview handler is attached', () => {
    const preview = vi.fn(() => true)
    const reveal = vi.fn()
    const editor = vi.fn()
    const link = pathLink({ reveal, editor, getPreview: () => preview })?.[0]
    expect(link).toBeDefined()

    link!.activate({ detail: 2 } as MouseEvent, link!.text)

    expect(preview).not.toHaveBeenCalled()
    expect(reveal).not.toHaveBeenCalled()
    expect(editor).toHaveBeenCalledExactlyOnceWith({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('uses the current preview handler when an existing link is activated', () => {
    const first = vi.fn(() => true)
    const next = vi.fn(() => true)
    let preview = first
    const link = pathLink({ getPreview: () => preview })?.[0]
    expect(link).toBeDefined()
    preview = next

    link!.activate({ detail: 1 } as MouseEvent, link!.text)

    expect(first).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledExactlyOnceWith({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('provides links when only a preview handler is attached', () => {
    const preview = vi.fn(() => true)
    const link = pathLink({ reveal: null, editor: null, getPreview: () => preview })?.[0]
    expect(link).toBeDefined()

    link!.activate({ detail: 1 } as MouseEvent, link!.text)

    expect(preview).toHaveBeenCalledExactlyOnceWith({ path: 'src/app.ts', line: 12, column: 3 })
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
    provided?.[0]?.activate({ detail: 1 } as MouseEvent, 'src/components/TerminalView.tsx:42')
    expect(reveal).toHaveBeenCalledWith('src/components/TerminalView.tsx')
  })

  test.each(['/tmp/reports/', 'C:\\reports\\'])(
    'previews hard-wrapped absolute links across terminal buffer rows: %s',
    (prefix) => {
      const captured: { provider?: ILinkProvider } = {}
      const lines = [`created ${prefix}`, 'report.md:4']
      const preview = vi.fn(() => true)
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
        () => null,
        () => '/repo',
        () => preview,
      )
      let links: ILink[] | undefined
      captured.provider?.provideLinks(2, (provided) => {
        links = provided
      })
      expect(links).toHaveLength(1)
      expect(links![0]!.range).toEqual({ start: { x: 9, y: 1 }, end: { x: 11, y: 2 } })
      links![0]!.activate({ detail: 1 } as MouseEvent, links![0]!.text)
      expect(preview).toHaveBeenCalledExactlyOnceWith({ path: `${prefix}report.md`, line: 4 })
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

    provided?.[0]?.activate({ detail: 1 } as MouseEvent, provided[0].text)
    expect(reveal).toHaveBeenCalledWith('backend/app/kooky_opt/one_person_team/repositories/agents.py')

    provided?.[0]?.activate({ detail: 2 } as MouseEvent, provided[0].text)
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

    registerTerminalRelativePathLinkProvider(
      term,
      () => reveal,
      () => openPathInEditor,
    )

    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    captured.provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })

    provided?.[0]?.activate({ detail: 2 } as MouseEvent, 'src/app.ts:12:3')

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

    provided?.[0]?.activate({ detail: 1 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
    expect(reveal).toHaveBeenCalledWith('src/app.ts')

    provided?.[0]?.activate({ detail: 2 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
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
    provided?.[0]?.activate({ detail: 2 } as MouseEvent, 'backend/app/main.py", line 42')

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
