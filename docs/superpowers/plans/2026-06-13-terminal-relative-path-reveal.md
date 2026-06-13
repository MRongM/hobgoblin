# Terminal Relative Path Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository-relative file paths printed in a terminal clickable so they reveal the matching file in the file explorer.

**Architecture:** Add a small terminal path-link helper that registers an xterm link provider and emits normalized worktree-relative paths. Pass an optional reveal handler through the terminal attach boundary, then lift file-tree reveal state to `RepoView` so terminal clicks and changed-file clicks share the existing `RepoExplorerPane` / `ProjectFileTree` reveal flow.

**Tech Stack:** React, TypeScript in Node strip-only mode, xterm `registerLinkProvider`, Vitest, existing Zustand repo store.

**Git Safety:** This plan intentionally contains no commit steps. The project instructions require explicit user confirmation before planning or executing git commits.

---

### Task 1: Add Terminal Relative Path Parsing And Link Provider

**Files:**
- Create: `src/web/components/terminal/terminal-path-links.ts`
- Create: `src/web/components/terminal/terminal-path-links.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/web/components/terminal/terminal-path-links.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
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
    let provider: { provideLinks: (line: number, cb: (links: unknown[] | undefined) => void) => void } | null = null
    const term = {
      buffer: {
        active: {
          getLine: (index: number) =>
            index === 0
              ? { translateToString: () => 'created src/app.ts:12' }
              : undefined,
        },
      },
      registerLinkProvider: vi.fn((nextProvider) => {
        provider = nextProvider
        return { dispose }
      }),
    }
    const reveal = vi.fn()

    const registration = registerTerminalRelativePathLinkProvider(term, () => reveal)

    expect(term.registerLinkProvider).toHaveBeenCalledTimes(1)
    let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
    provider?.provideLinks(1, (links) => {
      provided = links as typeof provided
    })
    expect(provided?.[0]?.text).toBe('src/app.ts:12')

    provided?.[0]?.activate(new MouseEvent('click'), 'src/app.ts:12')

    expect(reveal).toHaveBeenCalledWith('src/app.ts')
    registration.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('does not provide links when no reveal handler is attached', () => {
    let provider: { provideLinks: (line: number, cb: (links: unknown[] | undefined) => void) => void } | null = null
    const term = {
      buffer: {
        active: {
          getLine: () => ({ translateToString: () => 'created src/app.ts' }),
        },
      },
      registerLinkProvider: vi.fn((nextProvider) => {
        provider = nextProvider
        return { dispose: vi.fn() }
      }),
    }

    registerTerminalRelativePathLinkProvider(term, () => null)

    let provided: unknown[] | undefined = []
    provider?.provideLinks(1, (links) => {
      provided = links
    })
    expect(provided).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-path-links.test.ts
```

Expected: fail because `src/web/components/terminal/terminal-path-links.ts` does not exist.

- [ ] **Step 3: Implement path normalization and link provider**

Create `src/web/components/terminal/terminal-path-links.ts`:

```ts
import type { ILink, ILinkProvider, Terminal as XTermTerminal } from '@xterm/xterm'

type RevealPathHandler = (relativePath: string) => void

export interface TerminalRelativePathLink {
  text: string
  relativePath: string
  startColumn: number
  endColumn: number
}

const PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<])(?<token>(?:\.\/)?(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>])/gu
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/u
const LEADING_PUNCTUATION_PATTERN = /^[`"'([{<]+/u
const TRAILING_PUNCTUATION_PATTERN = /[`"',;)\]}>]+$/u

export function normalizeTerminalRelativePath(raw: string): string | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) return null

  let relativePath = trimmed.replace(LINE_SUFFIX_PATTERN, '')
  while (relativePath.startsWith('./')) relativePath = relativePath.slice(2)
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) return null

  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return relativePath
}

export function terminalRelativePathLinksForLine(line: string): TerminalRelativePathLink[] {
  const links: TerminalRelativePathLink[] = []
  for (const match of line.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const relativePath = normalizeTerminalRelativePath(token)
    if (!relativePath) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    links.push({
      text: token,
      relativePath,
      startColumn: startIndex + 1,
      endColumn: startIndex + token.length,
    })
  }
  return links
}

export function registerTerminalRelativePathLinkProvider(
  term: Pick<XTermTerminal, 'buffer' | 'registerLinkProvider'>,
  getRevealPathHandler: () => RevealPathHandler | null,
): { dispose: () => void } {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const revealPath = getRevealPathHandler()
      if (!revealPath) {
        callback(undefined)
        return
      }
      const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? ''
      const links = terminalRelativePathLinksForLine(line).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
        },
        text: link.text,
        decorations: { pointerCursor: true, underline: true },
        activate: (_event, text) => {
          const relativePath = normalizeTerminalRelativePath(text)
          if (relativePath) getRevealPathHandler()?.(relativePath)
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
```

- [ ] **Step 4: Run the new tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-path-links.test.ts
```

Expected: pass.

### Task 2: Attach Reveal Handlers To Managed Terminal Sessions

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Update terminal attach types**

In `src/web/components/terminal/types.ts`, add:

```ts
export interface TerminalSessionAttachHandlers {
  onRevealPath?: (relativePath: string) => void
}
```

Then update these signatures in the same file:

```ts
attach: (descriptor: TerminalDescriptor, host: HTMLElement, handlers?: TerminalSessionAttachHandlers) => void
```

and:

```ts
attach: (host: HTMLElement, handlers?: TerminalSessionAttachHandlers) => void
```

- [ ] **Step 2: Register the relative path provider in the terminal view**

In `src/web/components/terminal/terminal-session-view.ts`, import the helper:

```ts
import { registerTerminalRelativePathLinkProvider } from '#/web/components/terminal/terminal-path-links.ts'
```

Add a mutable handler field and setter inside `TerminalSessionView`:

```ts
private revealPathHandler: ((relativePath: string) => void) | null = null

setRevealPathHandler(handler: ((relativePath: string) => void) | null): void {
  this.revealPathHandler = handler
}
```

Add this method:

```ts
private installRelativePathLinkProvider(term: XTermTerminal): void {
  try {
    this.disposables.push(registerTerminalRelativePathLinkProvider(term, () => this.revealPathHandler))
  } catch (err) {
    console.warn('[terminal] failed to register relative path links', err)
  }
}
```

Call it from `installOptionalAddons` after `installWebLinksAddon(term)`:

```ts
this.installWebLinksAddon(term)
this.installRelativePathLinkProvider(term)
```

- [ ] **Step 3: Pass attach handlers through managed sessions and registry**

In `src/web/components/terminal/ManagedTerminalSession.ts`, import `TerminalSessionAttachHandlers` from `types.ts` and change `attach`:

```ts
attach(host: HTMLElement, handlers?: TerminalSessionAttachHandlers): void {
  if (this.disposed) return
  this.view.setRevealPathHandler(handlers?.onRevealPath ?? null)
  this.view.attach(host)
  if (this.runtime.canResize()) {
    if (this.view.currentTerminal()) {
      this.view.fitSoon()
    } else {
      this.start()
    }
  }
  if (this.runtime.phase() === 'open' && this.runtime.canResize() && this.view.isVisible()) this.view.focus()
}
```

In `detach`, clear the handler before parking:

```ts
this.view.setRevealPathHandler(null)
this.view.detach(host, parkingRoot)
```

In `src/web/components/terminal/TerminalSessionRegistry.ts`, import `TerminalSessionAttachHandlers` and change `attach`:

```ts
attach = (descriptor: TerminalDescriptor, host: HTMLElement, handlers?: TerminalSessionAttachHandlers): void => {
  this.ensureSession(descriptor).attach(host, handlers)
}
```

`TerminalSessionProvider.tsx` should not need behavior changes beyond satisfying the updated context type.

- [ ] **Step 4: Pass the handler from TerminalSlot attach**

In `src/web/components/terminal/TerminalSlot.tsx`, add the prop:

```ts
interface TerminalSlotProps {
  repoRoot: string
  branch: string
  worktreePath: string
  onRevealPath?: (relativePath: string) => void
}
```

Change the component signature:

```ts
export function TerminalSlot({ repoRoot, branch, worktreePath, onRevealPath }: TerminalSlotProps) {
```

Update the attach effect:

```ts
useLayoutEffect(() => {
  const host = hostRef.current
  if (!host || !descriptor) return
  attach(descriptor, host, { onRevealPath })
  return () => detach(descriptor.key, host)
}, [attach, descriptor, detach, onRevealPath])
```

- [ ] **Step 5: Update terminal tests**

In `src/web/components/terminal/TerminalSlot.test.tsx`, update the `attach` mock expectations with an added test:

```ts
test('passes reveal path handler through terminal attach', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const attach = vi.fn()
  const onRevealPath = vi.fn()
  const descriptor = {
    key: 'terminal-1',
    worktreeTerminalKey: '/repo\0/worktree',
    terminalId: 'terminal-1',
    index: 1,
    repoRoot: '/repo',
    branch: 'feature',
    worktreePath: '/worktree',
  }
  const context: TerminalSessionContextValue = {
    createTerminal: vi.fn(async () => 'terminal-1'),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
    attach,
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: () => ({
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
      count: 1,
    }),
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'open' as const, message: null, processName: 'zsh' }),
    subscribeSnapshot: () => () => {},
  }

  await act(async () => {
    root.render(
      <TerminalSessionContext.Provider value={context}>
        <TerminalSessionReadContext.Provider value={readContext}>
          <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" onRevealPath={onRevealPath} />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })

  try {
    expect(attach).toHaveBeenCalledWith(descriptor, expect.any(HTMLElement), { onRevealPath })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
```

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, extend `MockTerminal` with link provider support:

```ts
bufferLines: string[] = []
linkProviders: Array<{ provideLinks: (line: number, cb: (links: unknown[] | undefined) => void) => void }> = []
buffer = {
  active: {
    getLine: (index: number) => {
      const text = this.bufferLines[index]
      return typeof text === 'string' ? { translateToString: () => text } : undefined
    },
  },
}

registerLinkProvider(provider: { provideLinks: (line: number, cb: (links: unknown[] | undefined) => void) => void }) {
  this.linkProviders.push(provider)
  return { dispose: vi.fn(() => (this.linkProviders = this.linkProviders.filter((item) => item !== provider))) }
}
```

Add a focused test near the existing external link test:

```ts
test('reveals relative terminal path links through the current attach handler', async () => {
  const onRevealPath = vi.fn()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host, { onRevealPath })
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  term.bufferLines[0] = 'created src/app.ts:12'

  let links: Array<{ activate: (event: MouseEvent, text: string) => void; text: string }> | undefined
  term.linkProviders[0]?.provideLinks(1, (provided) => {
    links = provided as typeof links
  })
  links?.[0]?.activate(new MouseEvent('click'), 'src/app.ts:12')

  expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
  session.detach(host, document.createElement('div'))
  session.dispose({ closeSession: false })
})
```

- [ ] **Step 6: Run terminal-focused tests**

Run:

```bash
bun run test src/web/components/terminal/terminal-path-links.test.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: pass.

### Task 3: Bridge Terminal Reveals Into The File Explorer

**Files:**
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/BranchDetail.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailContent.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.test.tsx`

- [ ] **Step 1: Export and accept external reveal requests in RepoExplorerPane**

In `src/web/components/repo-workspace/RepoExplorerPane.tsx`, export the existing reveal request shape:

```ts
export interface FileTreeRevealRequest {
  id: number
  relativePath: string
}
```

Add an optional prop:

```ts
interface RepoExplorerPaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  showActions: boolean
  revealRequest?: FileTreeRevealRequest | null
}
```

Pass it into `ExplorerTabs`:

```tsx
<ExplorerTabs
  repoId={repoId}
  layout={layout}
  activeTab={activeTab}
  changeCount={changeCount}
  revealRequest={revealRequest ?? null}
  onTabChange={setActiveTab}
/>
```

Update `ExplorerTabs` props and sync external requests into the local request state:

```ts
function ExplorerTabs({
  repoId,
  layout,
  activeTab,
  changeCount,
  revealRequest: externalRevealRequest,
  onTabChange,
}: {
  repoId: string
  layout: RepoWorkspaceLayout
  activeTab: ExplorerTab
  changeCount: number
  revealRequest: FileTreeRevealRequest | null
  onTabChange: (tab: ExplorerTab) => void
}) {
```

Add an effect:

```ts
useEffect(() => {
  if (!externalRevealRequest) return
  onTabChange('files')
  setRevealRequest(externalRevealRequest)
}, [externalRevealRequest, onTabChange])
```

Import `useEffect` alongside `useState`.

- [ ] **Step 2: Lift terminal reveal state to RepoView**

In `src/web/components/RepoView.tsx`, import React state helpers:

```ts
import { useCallback, useState } from 'react'
```

Import the reveal request type:

```ts
import { RepoExplorerPane, type FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
```

Add state and handler inside `RepoView` after `useRepoToasts(repoId)`:

```ts
const [terminalRevealRequest, setTerminalRevealRequest] = useState<FileTreeRevealRequest | null>(null)
const handleTerminalRevealPath = useCallback((relativePath: string) => {
  setTerminalRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, relativePath }))
}, [])
```

Pass it down:

```tsx
<BranchDetail
  repoId={repoId}
  layout={layout}
  collapsed={behavior.detailCollapsed}
  detailFocusMode={behavior.detailFocusMode}
  onRevealPath={handleTerminalRevealPath}
/>
```

and:

```tsx
<RepoExplorerPane
  repoId={repoId}
  layout={layout}
  showActions={behavior.branchListActionsVisible}
  revealRequest={terminalRevealRequest}
/>
```

- [ ] **Step 3: Thread the reveal handler through branch detail**

In `src/web/components/BranchDetail.tsx`, add to `Props`:

```ts
onRevealPath?: (relativePath: string) => void
```

Thread `onRevealPath` through `BranchShortcutHandlerProps`, `BranchShortcutHandler`, and both `BranchDetailContent` render sites:

```tsx
<BranchDetailContent
  repo={repo}
  detail={detail}
  detailId={detailId}
  contentId={contentId}
  layout={layout}
  onRevealPath={onRevealPath}
/>
```

In `src/web/components/branch-detail/BranchDetailContent.tsx`, add the prop:

```ts
onRevealPath?: (relativePath: string) => void
```

Pass it into `BranchTerminalTab`, then into `TerminalSlot`:

```tsx
<TerminalSlot
  repoRoot={repoId}
  branch={branch.name}
  worktreePath={branch.worktree?.path}
  onRevealPath={onRevealPath}
/>
```

- [ ] **Step 4: Add explorer and repo view bridge tests**

In `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`, add:

```ts
test('external reveal requests switch to files with the requested path', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
  })

  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  await act(async () => {
    tabs[2]?.click()
  })
  expect(container.querySelector('[data-testid="project-status-panel"]')).toBeTruthy()

  await act(async () => {
    root.render(
      <RepoExplorerPane
        repoId="/repo"
        layout="top-bottom"
        showActions
        revealRequest={{ id: 1, relativePath: 'src/from-terminal.ts' }}
      />,
    )
  })

  expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
    'src/from-terminal.ts',
  )
  await act(async () => root.unmount())
})
```

In `src/web/components/RepoView.test.tsx`, update the mocks:

```ts
vi.mock('#/web/components/BranchDetail.tsx', () => ({
  BranchDetail: ({ onRevealPath }: { onRevealPath?: (relativePath: string) => void }) => (
    <button type="button" data-testid="branch-detail" onClick={() => onRevealPath?.('src/from-terminal.ts')}>
      branch detail
    </button>
  ),
}))

vi.mock('#/web/components/repo-workspace/RepoExplorerPane.tsx', () => ({
  RepoExplorerPane: ({ revealRequest }: { revealRequest?: { relativePath: string } | null }) => (
    <div data-testid="repo-explorer-pane" data-reveal-path={revealRequest?.relativePath ?? ''} />
  ),
}))
```

Add:

```ts
test('routes terminal reveal requests to the repository explorer', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
    currentBranch: 'main',
    selectedBranch: 'feature/a',
  })

  renderRepoView()

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
  })

  expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
    'src/from-terminal.ts',
  )
})
```

- [ ] **Step 5: Run workspace bridge tests**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx
```

Expected: pass.

### Task 4: Full Verification

**Files:**
- No new source files beyond Tasks 1-3.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected: pass.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: pass.

- [ ] **Step 4: Check whitespace and unrelated changes**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: `git diff --check` prints no errors. `git status` should include the planned terminal path reveal files plus any pre-existing unrelated working tree changes; do not revert unrelated changes.

## Self-Review

- Spec coverage: path normalization, xterm link provider, terminal handler propagation, explorer reveal bridge, failure no-op behavior, and verification commands are covered.
- Placeholder scan: no placeholder markers or unspecified implementation steps remain.
- Type consistency: `FileTreeRevealRequest`, `TerminalSessionAttachHandlers`, `onRevealPath`, `normalizeTerminalRelativePath`, `terminalRelativePathLinksForLine`, and `registerTerminalRelativePathLinkProvider` use the same names across tasks.
- Scope: renderer-only change; no terminal server protocol, Git command, or editor launch behavior is introduced.
