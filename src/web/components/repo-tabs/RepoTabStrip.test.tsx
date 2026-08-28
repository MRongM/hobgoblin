// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoTabStrip } from '#/web/components/repo-tabs/RepoTabStrip.tsx'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(window, 'localStorage', { configurable: true, value: createStorage() })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: createStorage() })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(max-width: 639px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  )
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

describe('RepoTabStrip', () => {
  test('opens a recent repository from the add-repository menu', async () => {
    const onOpenRecent = vi.fn()
    render(
      <RepoTabStrip
        repos={[]}
        activeId={null}
        labels={labels}
        recentRepos={[{ kind: 'local', id: '/tmp/recent-repo' }]}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
        onOpenRecent={onOpenRecent}
        onClearRecent={() => {}}
      />,
    )

    const trigger = document.body.querySelector<HTMLButtonElement>('button[aria-label="Open"]')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    const recentTrigger = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) =>
      item.textContent?.includes('Open Recent'),
    )
    await act(async () => {
      recentTrigger?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
      recentTrigger?.click()
      await Promise.resolve()
    })
    const recentRepo = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) =>
      item.textContent?.includes('/tmp/recent-repo'),
    )
    await act(async () => {
      recentRepo?.click()
      await Promise.resolve()
    })

    expect(onOpenRecent).toHaveBeenCalledWith({ kind: 'local', id: '/tmp/recent-repo' })
  })

  test('marks non-git local workspace tabs as plain repositories', () => {
    render(
      <RepoTabStrip
        repos={[
          repo('plain-project', '/tmp/plain-project', { isGitRepo: false, worktreePaths: ['/tmp/plain-project'] }),
        ]}
        activeId="/tmp/plain-project"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const tab = document.body.querySelector('[data-repo-tab-id="/tmp/plain-project"]')
    expect(tab?.getAttribute('data-repo-kind')).toBe('plain')
  })

  test('keeps remote repository tabs remote when git capability is false', () => {
    render(
      <RepoTabStrip
        repos={[repo('remote-project', 'ssh-config://example/srv%2Fremote-project', { isGitRepo: false })]}
        activeId="ssh-config://example/srv%2Fremote-project"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const tab = document.body.querySelector('[data-repo-tab-id="ssh-config://example/srv%2Fremote-project"]')
    expect(tab?.getAttribute('data-repo-kind')).toBe('remote')
  })

  test('marks a repo tab when any repo worktree has an unread terminal bell', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a', { worktreePaths: ['/tmp/repo-a', '/tmp/repo-a-feature'] })]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
      { bellWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a-feature'] },
    )

    const tab = document.body.querySelector('[data-repo-tab-id="/tmp/repo-a"]')
    expect(tab?.getAttribute('aria-label')).toContain('terminal.bell-unread')
    expect(tab?.querySelector('[aria-label="terminal.bell-unread"]')).not.toBeNull()
  })

  test('marks a repo tab when any repo worktree has active terminal output', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a', { worktreePaths: ['/tmp/repo-a', '/tmp/repo-a-feature'] })]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
      { outputActiveWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a-feature'] },
    )

    const tab = document.body.querySelector('[data-repo-tab-id="/tmp/repo-a"]')
    expect(tab?.getAttribute('aria-label')).toContain('terminal.output-active')
    expect(tab?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
  })

  test('shows a persistent terminal count badge when a repo worktree has open terminals', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a', { worktreePaths: ['/tmp/repo-a', '/tmp/repo-a-feature'] })]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
      { openWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a', '/tmp/repo-a\0/tmp/repo-a-feature'] },
    )

    const tab = document.body.querySelector('[data-repo-tab-id="/tmp/repo-a"]')
    expect(tab?.getAttribute('aria-label')).toContain('terminal.open-count')
    const badge = tab?.querySelector('[data-testid="repo-tab-terminal-count-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('2')
    expect(badge?.querySelector('svg')).not.toBeNull()
    expect(badge?.querySelector('[data-terminal-output-activity-indicator]')).toBeNull()
  })

  test('renders the terminal output activity effect inside the terminal count badge', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a', { worktreePaths: ['/tmp/repo-a'] })]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
      { outputActiveWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a'] },
    )

    const badge = document.body.querySelector('[data-testid="repo-tab-terminal-count-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('1')
    const indicator = badge?.querySelector('[data-terminal-output-activity-indicator="active"]')
    expect(indicator).not.toBeNull()
    expect(indicator?.className).toContain('size-2.5')
  })

  test('shows active terminal output and unread bell independently on a repo tab', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a', { worktreePaths: ['/tmp/repo-a', '/tmp/repo-a-feature'] })]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
      {
        bellWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a'],
        outputActiveWorktreeKeys: ['/tmp/repo-a\0/tmp/repo-a-feature'],
      },
    )

    const tab = document.body.querySelector('[data-repo-tab-id="/tmp/repo-a"]')
    expect(tab?.getAttribute('aria-label')).toContain('terminal.bell-unread')
    expect(tab?.getAttribute('aria-label')).toContain('terminal.output-active')
    expect(tab?.querySelector('[aria-label="terminal.bell-unread"]')).not.toBeNull()
    expect(tab?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
  })

  test('keeps the overflow menu trigger outside the tablist on small screens', () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a'), repo('repo-b', '/tmp/repo-b')]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const tablist = document.body.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal')
    expect(tablist?.querySelector('[role="tab"]')).not.toBeNull()
    expect(tablist?.querySelector('[aria-label="More"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="More"]')).not.toBeNull()
  })

  test('shows the active repo in the small-screen dropdown with selected styling', async () => {
    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a'), repo('repo-b', '/tmp/repo-b')]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const trigger = document.body.querySelector('button[aria-label="More"]')
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing more trigger')

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    const selectedItem = [...document.body.querySelectorAll('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('repo-a'),
    )
    expect(selectedItem?.getAttribute('aria-current')).toBe('true')
  })

  test('moves focus through the full tab strip with keyboard navigation on large screens', () => {
    vi.stubGlobal('matchMedia', createMatchMedia(false))
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    const onActivate = vi.fn()

    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a'), repo('repo-b', '/tmp/repo-b'), repo('repo-c', '/tmp/repo-c')]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={onActivate}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const repoA = document.body.querySelector('[data-repo-tab-id="/tmp/repo-a"]')
    const repoB = document.body.querySelector('[data-repo-tab-id="/tmp/repo-b"]')
    const repoC = document.body.querySelector('[data-repo-tab-id="/tmp/repo-c"]')
    if (
      !(repoA instanceof HTMLButtonElement) ||
      !(repoB instanceof HTMLButtonElement) ||
      !(repoC instanceof HTMLButtonElement)
    ) {
      throw new Error('missing repo tab buttons')
    }

    act(() => {
      repoA.focus()
      repoA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onActivate).toHaveBeenNthCalledWith(1, '/tmp/repo-b')
    expect(document.activeElement).toBe(repoB)

    act(() => {
      repoB.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(onActivate).toHaveBeenNthCalledWith(2, '/tmp/repo-c')
    expect(document.activeElement).toBe(repoC)

    act(() => {
      repoC.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(onActivate).toHaveBeenNthCalledWith(3, '/tmp/repo-a')
    expect(document.activeElement).toBe(repoA)
  })

  test('keeps project tabs content-sized within the 144px to 224px bounds', () => {
    vi.stubGlobal('matchMedia', createMatchMedia(false))

    render(
      <RepoTabStrip
        repos={[repo('a-project-with-a-long-display-name', '/tmp/project')]}
        activeId="/tmp/project"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const projectTab = container!.querySelector<HTMLElement>('[data-repo-tab-tooltip-id="/tmp/project"]')!
    const classes = projectTab.className.split(/\s+/)

    expect(classes).toContain('min-w-36')
    expect(classes).toContain('max-w-56')
    expect(classes).not.toContain('max-w-64')
    expect(classes.some((className) => /^w-\d+$/.test(className))).toBe(false)
  })

  test('uses tighter spacing between project tabs on large screens', () => {
    vi.stubGlobal('matchMedia', createMatchMedia(false))

    render(
      <RepoTabStrip
        repos={[repo('repo-a', '/tmp/repo-a'), repo('repo-b', '/tmp/repo-b'), repo('repo-c', '/tmp/repo-c')]}
        activeId="/tmp/repo-a"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    const tablist = document.body.querySelector('[role="tablist"]')
    expect(tablist?.className).toContain('gap-0.5')

    const activeTab = container!.querySelector<HTMLElement>('[data-repo-tab-tooltip-id="/tmp/repo-a"]')!
    const inactiveTab = container!.querySelector<HTMLElement>('[data-repo-tab-tooltip-id="/tmp/repo-b"]')!
    expect(activeTab.className).toContain('text-foreground')
    expect(inactiveTab.className).toContain('text-topbar-muted-foreground')
    expect(inactiveTab.querySelector('svg')?.getAttribute('class')).toContain('text-topbar-muted-foreground')

    const activeClose = activeTab.querySelector<HTMLButtonElement>('button[aria-label="Close repo-a"]')!
    const inactiveClose = inactiveTab.querySelector<HTMLButtonElement>('button[aria-label="Close repo-b"]')!
    expect(activeClose.className).toContain('text-muted-foreground')
    expect(activeClose.className).not.toContain('text-topbar-muted-foreground')
    expect(inactiveClose.className).toContain('text-topbar-muted-foreground')
    expect(inactiveTab.querySelector('span.border-topbar-border')).not.toBeNull()

    const openTrigger = container!.querySelector<HTMLButtonElement>('button[aria-label="Open"]')!
    expect(openTrigger.parentElement?.querySelector('span.border-topbar-border')).not.toBeNull()
  })

  test('asks for confirmation before clearing cache', async () => {
    window.localStorage.setItem('probe', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
      expect(document.body.textContent).toContain('Clear cache?')
      expect(window.localStorage.getItem('probe')).toBe('kept')
      expect(location.reload).not.toHaveBeenCalled()
    } finally {
      location.restore()
      window.localStorage.clear()
    }
  })

  test('clears storage and reloads after confirming', async () => {
    window.localStorage.setItem('probe', 'kept')
    window.sessionStorage.setItem('probe-session', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
      expect(window.localStorage.getItem('probe')).toBe('kept')

      await act(async () => {
        Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
          .find((button) => button.textContent?.includes('Clear and reload'))
          ?.click()
        await Promise.resolve()
      })

      expect(window.localStorage.getItem('probe')).toBeNull()
      expect(window.sessionStorage.getItem('probe-session')).toBeNull()
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    } finally {
      location.restore()
      window.localStorage.clear()
      window.sessionStorage.clear()
    }
  })

  test('cancelling the clear-cache dialog has no side effects', async () => {
    window.localStorage.setItem('probe', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      await act(async () => {
        Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
          .find((button) => button.textContent?.includes('dialog.cancel'))
          ?.click()
        await Promise.resolve()
      })

      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
      expect(window.localStorage.getItem('probe')).toBe('kept')
      expect(location.reload).not.toHaveBeenCalled()
    } finally {
      location.restore()
      window.localStorage.clear()
    }
  })
})

function render(
  element: React.ReactNode,
  fixture: {
    bellWorktreeKeys?: string[]
    outputActiveWorktreeKeys?: string[]
    openWorktreeKeys?: string[]
  } = {},
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const readContext = terminalReadContextWithState(
    new Set(fixture.bellWorktreeKeys ?? []),
    new Set(fixture.outputActiveWorktreeKeys ?? []),
    new Set(fixture.openWorktreeKeys ?? []),
  )
  act(() => {
    root!.render(
      <TerminalSessionReadContext.Provider value={readContext}>{element}</TerminalSessionReadContext.Provider>,
    )
  })
}

function repo(
  name: string,
  id: string,
  options: { worktreePaths?: string[]; isGitRepo?: boolean } = {},
): RepoTabSummary {
  return {
    id,
    name,
    remoteDetails: [],
    worktreePaths: options.worktreePaths ?? [],
    isGitRepo: options.isGitRepo,
  } as RepoTabSummary
}

function terminalReadContextWithState(
  bellKeys: ReadonlySet<string>,
  outputActiveKeys: ReadonlySet<string>,
  openKeys: ReadonlySet<string> = new Set(),
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const hasBell = bellKeys.has(worktreeTerminalKey)
      const isOutputActive = outputActiveKeys.has(worktreeTerminalKey)
      const isOpen = openKeys.has(worktreeTerminalKey)
      const sessions =
        hasBell || isOutputActive || isOpen
          ? [
              {
                key: `${worktreeTerminalKey}\0terminal-1`,
                worktreeTerminalKey,
                terminalId: 'terminal-1',
                index: 1,
                title: 'terminal',
                phase: 'open' as const,
                selected: true,
                hasBell,
                isOutputActive,
              },
            ]
          : []
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions,
        count: sessions.length,
      }
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

const labels = {
  repositories: 'Repositories',
  closeWithName: (name: string) => `Close ${name}`,
  more: 'More',
  dragToReorder: 'Drag to reorder',
  open: 'Open',
  openLocal: 'Open local repository…',
  openLocalShortcut: '⌘O',
  openWsl: 'Open WSL project…',
  openRemote: 'Open remote repository…',
  openRemoteShortcut: '⌘⇧R',
  clone: 'Clone repository…',
  cloneShortcut: '⌘⇧O',
  openRecent: 'Open Recent',
  noRecent: 'No Recent Repositories',
  clearRecent: 'Clear Menu',
  unavailable: 'Unavailable',
  clearCache: 'Clear cache',
  clearCacheConfirmTitle: 'Clear cache?',
  clearCacheConfirmMessage: 'Clears cached data for all repositories on this server and reloads the page.',
  clearCacheConfirmLabel: 'Clear and reload',
}

function renderEmptyStrip() {
  render(
    <RepoTabStrip
      repos={[]}
      activeId={null}
      labels={labels}
      onActivate={() => {}}
      onClose={() => {}}
      onReorder={() => {}}
      onOpenLocal={() => {}}
      onOpenRemote={() => {}}
      onClone={() => {}}
    />,
  )
}

async function selectClearCacheMenuItem() {
  const trigger = document.body.querySelector('button[aria-label="Open"]')
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing open trigger')
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('Clear cache'))
      ?.click()
    await Promise.resolve()
  })
}

function stubLocationReload(): { reload: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalLocation = window.location
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
  return {
    reload,
    restore: () => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }),
  }
}

function createMatchMedia(matches: boolean) {
  return (query: string) => ({
    matches: query === '(max-width: 639px)' ? matches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
