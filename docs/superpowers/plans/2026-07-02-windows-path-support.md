# Windows Path Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Windows local path handling plus Windows external editor and terminal opening for the existing runtime app.

**Architecture:** Add a small shared path semantics helper for cross-platform string parsing and worktree containment. Keep file system access in `src/system/**`, keep terminal link interaction in terminal UI modules, and keep OS process launching behind system-level editor/terminal backends.

**Tech Stack:** TypeScript, Bun strip-only runtime, React renderer, Hono server routes, Vitest, execa, Node `fs`/`path`.

---

## Repository Constraint

The project `AGENTS.md` says not to plan or execute git commits unless the user explicitly asks. This plan therefore uses verification and `git status --short` checkpoints instead of commit steps.

## File Structure

- Create `src/shared/path-semantics.ts`
  - Owns string-only path style detection, relative path validation, absolute worktree containment, and worktree-relative conversion.
  - Does not import `node:path` or read the filesystem.

- Create `src/shared/path-semantics.test.ts`
  - Tests POSIX paths, Windows drive paths, UNC style detection, containment, and joining.

- Modify `src/shared/file-path-target.ts`
  - Adds parser options so existing callers keep relative-only behavior by default.
  - Adds Windows drive absolute token recognition when `allowAbsolute` is enabled.

- Modify `src/shared/file-path-target.test.ts`
  - Keeps current relative-path tests.
  - Adds Windows absolute parsing tests behind `allowAbsolute`.

- Modify `src/web/components/terminal/terminal-path-links.ts`
  - Resolves terminal targets against the active worktree.
  - Filters absolute targets outside the active worktree.
  - Emits relative reveal paths and absolute editor targets.

- Modify `src/web/components/terminal/terminal-path-links.test.ts`
  - Tests worktree-contained Windows absolute links, worktree-external rejection, single-click reveal, and double-click editor target preservation.

- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Stores the active worktree path and passes it to the terminal link provider.

- Modify `src/web/components/terminal/ManagedTerminalSession.ts`
  - Updates `TerminalSessionView` with `descriptor.worktreePath` when sessions are created or descriptors change.

- Modify `src/web/lib/editor-open-targets.ts`
  - Resolves relative targets under the worktree and preserves absolute targets that are already inside the worktree.

- Modify `src/web/lib/editor-open-targets.test.ts`
  - Adds Windows absolute target tests.

- Modify `src/web/lib/paths.test.ts`
  - Adds Windows relative display and default worktree regression tests.

- Modify `src/system/command.ts`
  - Adds a command resolver that returns the first executable command candidate.

- Modify `src/system/open-app.ts`
  - Adds platform-aware VS Code-family CLI detection and local opening.
  - Keeps macOS `.app` bundle logic unchanged.

- Modify `src/system/open-app.test.ts`
  - Adds Windows editor CLI detection and `--goto` command tests.

- Create `src/system/windows-terminal.ts`
  - Opens local directories with `wt.exe`, falling back to PowerShell.
  - Does not support external remote terminal opening in this phase.

- Create `src/system/windows-terminal.test.ts`
  - Tests Windows Terminal preference, PowerShell fallback, invalid paths, and unavailable terminal errors.

- Modify `src/system/terminals.ts`
  - Maps existing `terminal` preference to Terminal.app on macOS and Windows Terminal/PowerShell on Windows.

- Modify `src/system/terminals.test.ts`
  - Adds Windows availability and open dispatch tests.

## Task 1: Shared Path Semantics

**Files:**
- Create: `src/shared/path-semantics.ts`
- Create: `src/shared/path-semantics.test.ts`

- [ ] **Step 1: Write failing tests for path style and containment**

Create `src/shared/path-semantics.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  joinWorktreeRelativePath,
  pathStyle,
  safeRelativePath,
  worktreeRelativePathFromAbsolute,
} from '#/shared/path-semantics.ts'

describe('pathStyle', () => {
  test('classifies posix, windows drive, UNC, and relative paths', () => {
    expect(pathStyle('/repo/src/app.ts')).toBe('posixAbsolute')
    expect(pathStyle('C:\\repo\\src\\app.ts')).toBe('windowsDriveAbsolute')
    expect(pathStyle('c:/repo/src/app.ts')).toBe('windowsDriveAbsolute')
    expect(pathStyle('\\\\server\\share\\repo')).toBe('windowsUncAbsolute')
    expect(pathStyle('src/app.ts')).toBe('relative')
  })
})

describe('safeRelativePath', () => {
  test('normalizes safe relative paths to slash separators', () => {
    expect(safeRelativePath('src/app.ts')).toBe('src/app.ts')
    expect(safeRelativePath('./src/app.ts')).toBe('src/app.ts')
  })

  test('rejects unsafe relative path input', () => {
    expect(safeRelativePath('')).toBeNull()
    expect(safeRelativePath('../app.ts')).toBeNull()
    expect(safeRelativePath('src/../app.ts')).toBeNull()
    expect(safeRelativePath('src//app.ts')).toBeNull()
    expect(safeRelativePath('src\\app.ts')).toBeNull()
    expect(safeRelativePath('src/\0/app.ts')).toBeNull()
  })
})

describe('worktreeRelativePathFromAbsolute', () => {
  test('returns slash relative paths for contained POSIX paths', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo/src/app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo')).toBe('.')
  })

  test('rejects POSIX sibling prefixes', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo2/app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('/repo', '/other/app.ts')).toBeNull()
  })

  test('returns slash relative paths for contained Windows drive paths', () => {
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo\\src\\app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('c:/repo', 'C:\\repo\\src\\app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo')).toBe('.')
  })

  test('rejects Windows siblings and different drives', () => {
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo2\\app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'D:\\repo\\app.ts')).toBeNull()
  })

  test('does not mix POSIX and Windows styles', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', 'C:\\repo\\app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('C:\\repo', '/repo/app.ts')).toBeNull()
  })
})

describe('joinWorktreeRelativePath', () => {
  test('joins POSIX and Windows worktree paths with the existing separator style', () => {
    expect(joinWorktreeRelativePath('/repo', 'src/app.ts')).toBe('/repo/src/app.ts')
    expect(joinWorktreeRelativePath('C:\\repo', 'src/app.ts')).toBe('C:\\repo\\src\\app.ts')
    expect(joinWorktreeRelativePath('C:/repo', 'src/app.ts')).toBe('C:/repo/src/app.ts')
  })
})
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
bun run test src/shared/path-semantics.test.ts
```

Expected: FAIL because `src/shared/path-semantics.ts` does not exist.

- [ ] **Step 3: Implement the shared helper**

Create `src/shared/path-semantics.ts`:

```ts
export type PathStyle = 'posixAbsolute' | 'windowsDriveAbsolute' | 'windowsUncAbsolute' | 'relative'

interface WindowsDriveParts {
  drive: string
  parts: string[]
  separator: '\\' | '/'
}

const WINDOWS_DRIVE_RE = /^([A-Za-z]):([\\/])(.*)$/u
const WINDOWS_UNC_RE = /^\\\\[^\\/\0]+[\\/][^\\/\0]+(?:[\\/].*)?$/u

export function pathStyle(value: string): PathStyle {
  if (value.startsWith('/')) return 'posixAbsolute'
  if (WINDOWS_DRIVE_RE.test(value)) return 'windowsDriveAbsolute'
  if (WINDOWS_UNC_RE.test(value)) return 'windowsUncAbsolute'
  return 'relative'
}

export function safeRelativePath(value: string): string | null {
  let normalized = value.trim()
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  if (!normalized || normalized.includes('\0') || normalized.includes('\\')) return null
  if (normalized.startsWith('/') || pathStyle(normalized) !== 'relative') return null
  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

export function worktreeRelativePathFromAbsolute(worktreePath: string, candidatePath: string): string | null {
  const worktreeStyle = pathStyle(worktreePath)
  const candidateStyle = pathStyle(candidatePath)
  if (worktreeStyle !== candidateStyle) return null

  if (worktreeStyle === 'posixAbsolute') {
    return posixRelativeInside(worktreePath, candidatePath)
  }
  if (worktreeStyle === 'windowsDriveAbsolute') {
    return windowsDriveRelativeInside(worktreePath, candidatePath)
  }
  return null
}

export function joinWorktreeRelativePath(worktreePath: string, relativePath: string): string {
  const normalizedRelative = safeRelativePath(relativePath)
  if (!normalizedRelative || normalizedRelative === '.') return worktreePath
  const trimmedRoot = worktreePath.replace(/[\\/]+$/u, '')
  const separator = worktreePath.includes('\\') && !worktreePath.includes('/') ? '\\' : '/'
  return `${trimmedRoot}${separator}${normalizedRelative.split('/').join(separator)}`
}

function posixRelativeInside(worktreePath: string, candidatePath: string): string | null {
  const rootParts = splitPosix(worktreePath)
  const candidateParts = splitPosix(candidatePath)
  if (!partsStartWith(candidateParts, rootParts, false)) return null
  return candidateParts.slice(rootParts.length).join('/') || '.'
}

function splitPosix(value: string): string[] {
  return value.split('/').filter(Boolean)
}

function windowsDriveRelativeInside(worktreePath: string, candidatePath: string): string | null {
  const root = windowsDriveParts(worktreePath)
  const candidate = windowsDriveParts(candidatePath)
  if (!root || !candidate || root.drive !== candidate.drive) return null
  if (!partsStartWith(candidate.parts, root.parts, true)) return null
  return candidate.parts.slice(root.parts.length).join('/') || '.'
}

function windowsDriveParts(value: string): WindowsDriveParts | null {
  const match = WINDOWS_DRIVE_RE.exec(value)
  if (!match) return null
  const rawTail = match[3] ?? ''
  return {
    drive: (match[1] ?? '').toUpperCase(),
    separator: match[2] === '/' ? '/' : '\\',
    parts: rawTail.split(/[\\/]+/u).filter(Boolean),
  }
}

function partsStartWith(candidate: string[], root: string[], insensitive: boolean): boolean {
  if (candidate.length < root.length) return false
  for (let i = 0; i < root.length; i += 1) {
    const a = candidate[i] ?? ''
    const b = root[i] ?? ''
    if (insensitive ? a.toLowerCase() !== b.toLowerCase() : a !== b) return false
  }
  return true
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
bun run test src/shared/path-semantics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check worktree status**

Run:

```bash
git status --short
```

Expected: shows the new helper and test files as modified/untracked. Do not commit.

## Task 2: File Path Target Parser Options

**Files:**
- Modify: `src/shared/file-path-target.ts`
- Modify: `src/shared/file-path-target.test.ts`

- [ ] **Step 1: Add failing parser tests**

Extend `src/shared/file-path-target.test.ts` with these tests:

```ts
test('keeps absolute paths disabled by default', () => {
  expect(parseFilePathTarget('C:\\repo\\src\\app.ts:12')).toBeNull()
  expect(parseFilePathTarget('/repo/src/app.ts:12')).toBeNull()
})

test('accepts Windows and POSIX absolute paths when explicitly enabled', () => {
  expect(parseFilePathTarget('C:\\repo\\src\\app.ts:12', { allowAbsolute: true })).toEqual({
    path: 'C:\\repo\\src\\app.ts',
    line: 12,
  })
  expect(parseFilePathTarget('C:/repo/src/app.ts:12:3', { allowAbsolute: true })).toEqual({
    path: 'C:/repo/src/app.ts',
    line: 12,
    column: 3,
  })
  expect(parseFilePathTarget('/repo/src/app.ts:12', { allowAbsolute: true })).toEqual({
    path: '/repo/src/app.ts',
    line: 12,
  })
})

test('does not accept UNC paths as terminal file targets', () => {
  expect(parseFilePathTarget('\\\\server\\share\\repo\\src\\app.ts', { allowAbsolute: true })).toBeNull()
})

test('finds absolute path spans only when explicitly enabled', () => {
  expect(filePathTargetsForText('at C:\\repo\\src\\app.ts:12')).toEqual([])
  expect(filePathTargetsForText('at C:\\repo\\src\\app.ts:12', { allowAbsolute: true })).toEqual([
    {
      text: 'C:\\repo\\src\\app.ts:12',
      target: { path: 'C:\\repo\\src\\app.ts', line: 12 },
      startIndex: 3,
      endIndex: 24,
    },
  ])
})
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
bun run test src/shared/file-path-target.test.ts
```

Expected: FAIL because `parseFilePathTarget` does not accept an options parameter and absolute spans are not scanned.

- [ ] **Step 3: Add parser options and absolute scanning**

Modify `src/shared/file-path-target.ts`:

```ts
import { pathStyle, safeRelativePath } from '#/shared/path-semantics.ts'

export interface FilePathTargetParseOptions {
  allowAbsolute?: boolean
}

const ABSOLUTE_PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<:：,，、;；（［【｛《〈「『])(?<token>(?:[A-Za-z]:[\\/]|\/)[^\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、]+)(?=$|[\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、])/gu
```

Update `parseFilePathTarget` so its signature and path checks are:

```ts
export function parseFilePathTarget(raw: string, options: FilePathTargetParseOptions = {}): FilePathTarget | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null

  const target = splitLineTarget(trimmed)
  if (!target) return null

  const style = pathStyle(target.path)
  if (style !== 'relative') {
    if (!options.allowAbsolute || style === 'windowsUncAbsolute') return null
    return target.column === undefined
      ? target.line === undefined
        ? { path: target.path }
        : { path: target.path, line: target.line }
      : { path: target.path, line: target.line, column: target.column }
  }

  const relativePath = safeRelativePath(target.path)
  if (!relativePath) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return target.column === undefined
    ? target.line === undefined
      ? { path: relativePath }
      : { path: relativePath, line: target.line }
    : { path: relativePath, line: target.line, column: target.column }
}
```

Update `filePathTargetsForText` signature and scan order:

```ts
export function filePathTargetsForText(
  text: string,
  options: FilePathTargetParseOptions = {},
): FilePathTargetSpan[] {
  const spans: FilePathTargetSpan[] = []
  for (const match of text.matchAll(PYTHON_FILE_LINE_PATTERN)) {
    const path = match.groups?.path
    const line = match.groups?.line
    if (!path || !line || match.index === undefined) continue
    const prefixLength = match[0].indexOf(path)
    if (prefixLength < 0) continue
    const startIndex = match.index + prefixLength
    const endIndex = match.index + match[0].length
    const target = parseFilePathTarget(`${path}:${line}`, options)
    if (!target || spanOverlaps(spans, startIndex, endIndex)) continue
    spans.push({ text: text.slice(startIndex, endIndex), target, startIndex, endIndex })
  }

  if (options.allowAbsolute) {
    for (const match of text.matchAll(ABSOLUTE_PATH_TOKEN_PATTERN)) {
      const token = match.groups?.token
      if (!token || match.index === undefined) continue
      const target = parseFilePathTarget(token, options)
      if (!target) continue
      const tokenOffset = match[0].indexOf(token)
      const startIndex = match.index + tokenOffset
      const endIndex = startIndex + token.length
      if (spanOverlaps(spans, startIndex, endIndex)) continue
      spans.push({ text: token, target, startIndex, endIndex })
    }
  }

  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const target = parseFilePathTarget(token, options)
    if (!target) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    const endIndex = startIndex + token.length
    if (spanOverlaps(spans, startIndex, endIndex)) continue
    spans.push({ text: token, target, startIndex, endIndex })
  }
  return spans.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
bun run test src/shared/file-path-target.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing path text component tests**

Run:

```bash
bun run test src/web/components/PathTargetText.test.tsx
```

Expected: PASS. This verifies default parser behavior remains relative-only for non-worktree-aware text rendering.

## Task 3: Worktree-Aware Terminal Path Links

**Files:**
- Modify: `src/web/components/terminal/terminal-path-links.ts`
- Modify: `src/web/components/terminal/terminal-path-links.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`

- [ ] **Step 1: Add failing terminal path link tests**

Extend `src/web/components/terminal/terminal-path-links.test.ts`:

```ts
test('links Windows absolute paths inside the active worktree', () => {
  expect(terminalRelativePathLinksForLine('created C:\\repo\\src\\app.ts:12', 'C:\\repo')).toEqual([
    {
      text: 'C:\\repo\\src\\app.ts:12',
      target: { path: 'C:\\repo\\src\\app.ts', line: 12 },
      revealPath: 'src/app.ts',
      startColumn: 9,
      endColumn: 29,
    },
  ])
})

test('does not link Windows absolute paths outside the active worktree', () => {
  expect(terminalRelativePathLinksForLine('created C:\\other\\src\\app.ts:12', 'C:\\repo')).toEqual([])
})

test('keeps relative path link behavior without a worktree path', () => {
  expect(terminalRelativePathLinksForLine('created src/app.ts:12')).toEqual([
    {
      text: 'src/app.ts:12',
      target: { path: 'src/app.ts', line: 12 },
      revealPath: 'src/app.ts',
      startColumn: 9,
      endColumn: 21,
    },
  ])
})
```

Add an activation test:

```ts
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

  registerTerminalRelativePathLinkProvider(term, () => reveal, () => openPathInEditor, () => 'C:\\repo')

  let provided: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> | undefined
  captured.provider?.provideLinks(1, (links) => {
    provided = links as typeof provided
  })

  provided?.[0]?.activate({ detail: 1 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
  expect(reveal).toHaveBeenCalledWith('src/app.ts')

  provided?.[0]?.activate({ detail: 2 } as MouseEvent, 'C:\\repo\\src\\app.ts:12:3')
  expect(openPathInEditor).toHaveBeenCalledWith({ path: 'C:\\repo\\src\\app.ts', line: 12, column: 3 })
})
```

- [ ] **Step 2: Run terminal path link tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-path-links.test.ts
```

Expected: FAIL because terminal links are not worktree-aware and do not scan absolute targets.

- [ ] **Step 3: Implement worktree-aware link resolution**

Modify `src/web/components/terminal/terminal-path-links.ts` imports:

```ts
import { filePathTargetsForText, type FilePathTarget } from '#/shared/file-path-target.ts'
import { pathStyle, worktreeRelativePathFromAbsolute } from '#/shared/path-semantics.ts'
```

Update types:

```ts
type RevealPathHandler = (relativePath: string) => void
type OpenPathInEditorHandler = (target: FilePathTarget) => void
type WorktreePathProvider = () => string | null

export interface TerminalRelativePathLink {
  text: string
  target: FilePathTarget
  revealPath: string
  startColumn: number
  endColumn: number
}
```

Replace `terminalRelativePathLinksForLine`:

```ts
export function terminalRelativePathLinksForLine(line: string, worktreePath?: string | null): TerminalRelativePathLink[] {
  return filePathTargetsForText(line, { allowAbsolute: !!worktreePath }).flatMap((span) => {
    const revealPath = revealPathForTarget(span.target, worktreePath)
    if (!revealPath) return []
    return [
      {
        text: span.text,
        target: span.target,
        revealPath,
        startColumn: span.startIndex + 1,
        endColumn: span.endIndex,
      },
    ]
  })
}

function revealPathForTarget(target: FilePathTarget, worktreePath?: string | null): string | null {
  if (pathStyle(target.path) === 'relative') return target.path
  return worktreePath ? worktreeRelativePathFromAbsolute(worktreePath, target.path) : null
}
```

Update `registerTerminalRelativePathLinkProvider` signature and usage:

```ts
export function registerTerminalRelativePathLinkProvider(
  term: TerminalLinkProviderHost,
  getRevealPathHandler: () => RevealPathHandler | null,
  getOpenPathInEditorHandler: () => OpenPathInEditorHandler | null,
  getWorktreePath: WorktreePathProvider = () => null,
): { dispose: () => void } {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber, callback) {
      const revealPath = getRevealPathHandler()
      const openPathInEditor = getOpenPathInEditorHandler()
      if (!revealPath && !openPathInEditor) {
        callback(undefined)
        return
      }
      const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? ''
      const links = terminalRelativePathLinksForLine(line, getWorktreePath()).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
        },
        text: link.text,
        decorations: { pointerCursor: true, underline: true },
        activate: (event) => {
          if (activationDetail(event) >= 2) {
            getOpenPathInEditorHandler()?.(link.target)
            return
          }
          getRevealPathHandler()?.(link.revealPath)
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
```

- [ ] **Step 4: Pass worktree path from managed session to terminal view**

Modify `src/web/components/terminal/terminal-session-view.ts`:

```ts
private worktreePath: string | null = null

setWorktreePath(worktreePath: string | null): void {
  this.worktreePath = worktreePath
}
```

Update `installRelativePathLinkProvider`:

```ts
registerTerminalRelativePathLinkProvider(
  term,
  () => this.revealPathHandler,
  () => this.openPathInEditorHandler,
  () => this.worktreePath,
)
```

Modify `src/web/components/terminal/ManagedTerminalSession.ts` constructor and `updateDescriptor`:

```ts
this.view = new TerminalSessionView({
  onInput: (data) => this.writeInput(data),
  onBell: () => this.handleBell(),
  onResize: ({ cols, rows }) => this.queueResize(cols, rows),
  onSearchResult: (event) => this.updateSearchResult(event),
  onProgress: (state, value) => this.updateProgress(state, value),
  onOpenExternalLink: (uri) => this.openExternalLink(uri),
  onRenderRecoveryRequest: () => this.recoverActiveView(),
}, { fontSize, terminalThemeMode })
this.view.setWorktreePath(descriptor.worktreePath)
```

```ts
updateDescriptor(descriptor: TerminalDescriptor): void {
  this.descriptor = descriptor
  this.view.setWorktreePath(descriptor.worktreePath)
}
```

- [ ] **Step 5: Run terminal tests**

Run:

```bash
bun run test src/web/components/terminal/terminal-path-links.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: PASS.

## Task 4: Editor Target Resolution

**Files:**
- Modify: `src/web/lib/editor-open-targets.ts`
- Modify: `src/web/lib/editor-open-targets.test.ts`

- [ ] **Step 1: Add failing editor target resolution tests**

Extend `src/web/lib/editor-open-targets.test.ts`:

```ts
test('preserves contained Windows absolute editor targets', async () => {
  const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

  await openWorktreeEditorTarget('/repo', 'C:\\repo', { path: 'C:\\repo\\src\\app.ts', line: 12 })

  expect(mocks.openRepositoryEditor).toHaveBeenCalledWith({ path: 'C:\\repo\\src\\app.ts', line: 12 })
})

test('rejects Windows absolute editor targets outside the worktree', async () => {
  const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

  await expect(
    openWorktreeEditorTarget('/repo', 'C:\\repo', { path: 'D:\\other\\src\\app.ts', line: 12 }),
  ).resolves.toEqual({ ok: false, message: 'error.invalid-path' })
})
```

- [ ] **Step 2: Run the editor target tests and verify failure**

Run:

```bash
bun run test src/web/lib/editor-open-targets.test.ts
```

Expected: FAIL because absolute targets are always joined under the worktree today.

- [ ] **Step 3: Update target resolution**

Modify `src/web/lib/editor-open-targets.ts` imports:

```ts
import { joinWorktreeRelativePath, pathStyle, worktreeRelativePathFromAbsolute } from '#/shared/path-semantics.ts'
```

Replace `resolveWorktreeEditorTarget` and adjust `openWorktreeEditorTarget`:

```ts
export function resolveWorktreeEditorTarget(worktreePath: string, target: FilePathTarget): FilePathTarget | null {
  if (pathStyle(target.path) !== 'relative') {
    return worktreeRelativePathFromAbsolute(worktreePath, target.path) === null ? null : target
  }
  return {
    ...target,
    path: joinWorktreeRelativePath(worktreePath, target.path),
  }
}

export async function openWorktreeEditorTarget(
  repoId: string,
  worktreePath: string,
  target: FilePathTarget,
): Promise<ExecResult> {
  const resolved = resolveWorktreeEditorTarget(worktreePath, target)
  if (!resolved) return { ok: false, message: 'error.invalid-path' }
  return isRemoteRepoId(repoId) ? await openRemoteRepositoryEditor(repoId, resolved) : await openRepositoryEditor(resolved)
}
```

Remove the now-unused `joinPath` import from `src/web/lib/editor-open-targets.ts`.

- [ ] **Step 4: Run editor target tests**

Run:

```bash
bun run test src/web/lib/editor-open-targets.test.ts src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: PASS.

## Task 5: Windows Editor CLI Support

**Files:**
- Modify: `src/system/command.ts`
- Modify: `src/system/open-app.ts`
- Modify: `src/system/open-app.test.ts`
- Modify: `src/system/vscode.ts`
- Modify: `src/system/cursor.ts`
- Modify: `src/system/windsurf.ts`

- [ ] **Step 1: Add failing command resolver tests in `open-app.test.ts`**

Extend `src/system/open-app.test.ts` with Windows tests. Add `hasCommand` to the hoisted mocks and mock `#/system/command.ts`:

```ts
const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  existsSync: vi.fn(),
  hasCommand: vi.fn(),
  homedir: vi.fn(() => '/Users/test'),
  statSync: vi.fn(
    (): { isDirectory: () => boolean; isFile: () => boolean } => ({
      isDirectory: () => true,
      isFile: () => false,
    }),
  ),
}))

vi.mock('#/system/command.ts', () => ({
  hasCommand: mocks.hasCommand,
  firstAvailableCommand: (commands: string[]) => commands.find((command) => mocks.hasCommand(command)) ?? null,
}))
```

Add tests:

```ts
describe('openByEditorCli', () => {
  const originalPlatform = process.platform

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setPlatform('win32')
    mocks.hasCommand.mockImplementation((command: string) => command === 'code.cmd')
    mocks.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true })
    mocks.execa.mockResolvedValue({ failed: false })
  })

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  test('detects Windows VS Code-family command candidates', async () => {
    const { hasEditorCli } = await import('#/system/open-app.ts')

    expect(hasEditorCli('Visual Studio Code', 'code')).toBe(true)
    expect(mocks.hasCommand).toHaveBeenCalledWith('code.cmd')
  })

  test('opens a Windows file path with --goto when line is present', async () => {
    const { openByEditorCli } = await import('#/system/open-app.ts')

    await expect(
      openByEditorCli('Visual Studio Code', 'code', { path: 'C:\\repo\\src\\app.ts', line: 12, column: 3 }),
    ).resolves.toEqual({ ok: true, message: 'C:\\repo\\src\\app.ts' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'code.cmd',
      ['--goto', 'C:\\repo\\src\\app.ts:12:3'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })
})
```

- [ ] **Step 2: Run Windows editor tests and verify failure**

Run:

```bash
bun run test src/system/open-app.test.ts
```

Expected: FAIL because `hasEditorCli` and `openByEditorCli` do not exist.

- [ ] **Step 3: Add a command candidate resolver**

Modify `src/system/command.ts`:

```ts
export function firstAvailableCommand(commands: string[], extraDirectories: string[] = []): string | null {
  for (const command of commands) {
    if (hasCommand(command, extraDirectories)) return command
  }
  return null
}
```

- [ ] **Step 4: Add platform-aware editor CLI helpers**

Modify `src/system/open-app.ts` imports:

```ts
import { firstAvailableCommand } from '#/system/command.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
```

Add helpers:

```ts
function editorCliCandidates(cliName: string): string[] {
  return process.platform === 'win32' ? [`${cliName}.cmd`, `${cliName}.exe`, cliName] : [cliName]
}

function resolveEditorCommand(cliName: string): string | null {
  return firstAvailableCommand(editorCliCandidates(cliName))
}

function isUsableEditorPathForPlatform(p: string): boolean {
  if (p.includes('\0')) return false
  if (process.platform === 'win32') {
    const style = pathStyle(p)
    if (style !== 'windowsDriveAbsolute' && style !== 'windowsUncAbsolute') return false
  } else if (!path.isAbsolute(p)) {
    return false
  }
  try {
    const stat = statSync(p)
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}

export function hasEditorCli(appName: string, cliName: string): boolean {
  if (process.platform === 'darwin') return hasAppCli(appName, cliName)
  return resolveEditorCommand(cliName) !== null
}

export function openByEditorCli(
  appName: string,
  cliName: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  if (process.platform === 'darwin') return openByAppCli(appName, cliName, target)
  const targetPath = editorTargetPath(target)
  if (!isUsableEditorPathForPlatform(targetPath)) return Promise.resolve({ ok: false, message: 'error.invalid-path' })
  const command = resolveEditorCommand(cliName)
  if (!command) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })
  const args =
    typeof target === 'string' || target.line === undefined
      ? [targetPath]
      : ['--goto', editorTargetPathArgument(target)]
  return execa(command, args, {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.editor-not-installed'
      return { ok: false, message }
    }
    return { ok: true, message: targetPath }
  })
}
```

Keep `openByAppCli` and `openRemoteByAppCli` intact for macOS and remote behavior.

- [ ] **Step 5: Use platform-aware helpers from editor modules**

Modify each editor module:

`src/system/vscode.ts`:

```ts
import { hasEditorCli, openByEditorCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Visual Studio Code'
const CLI_NAME = 'code'

export function isVSCodeInstalled(): boolean {
  return hasEditorCli(APP_NAME, CLI_NAME)
}

export function openInVSCode(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByEditorCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInVSCode(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
```

`src/system/cursor.ts`:

```ts
import { hasEditorCli, openByEditorCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Cursor'
const CLI_NAME = 'cursor'

export function isCursorInstalled(): boolean {
  return hasEditorCli(APP_NAME, CLI_NAME)
}

export function openInCursor(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByEditorCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInCursor(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
```

`src/system/windsurf.ts`:

```ts
import { hasEditorCli, openByEditorCli, openRemoteByAppCli } from '#/system/open-app.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

const APP_NAME = 'Windsurf'
const CLI_NAME = 'windsurf'

export function isWindsurfInstalled(): boolean {
  return hasEditorCli(APP_NAME, CLI_NAME)
}

export function openInWindsurf(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByEditorCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInWindsurf(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
```

- [ ] **Step 6: Run editor tests**

Run:

```bash
bun run test src/system/open-app.test.ts src/system/editors.test.ts
```

Expected: PASS.

## Task 6: Windows External Terminal Support

**Files:**
- Create: `src/system/windows-terminal.ts`
- Create: `src/system/windows-terminal.test.ts`
- Modify: `src/system/terminals.ts`
- Modify: `src/system/terminals.test.ts`

- [ ] **Step 1: Add failing Windows terminal tests**

Create `src/system/windows-terminal.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  hasCommand: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({ statSync: mocks.statSync }))
vi.mock('#/system/command.ts', () => ({
  hasCommand: mocks.hasCommand,
}))

describe('windows terminal backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execa.mockResolvedValue({ failed: false })
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe')
  })

  test('opens Windows Terminal in the requested directory', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo'],
      expect.objectContaining({ timeout: 10_000 }),
    )
  })

  test('falls back to PowerShell when wt.exe is unavailable', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'powershell.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoExit', '-Command', 'Set-Location -LiteralPath $args[0]', 'C:\\repo'],
      expect.objectContaining({ timeout: 10_000 }),
    )
  })

  test('reports terminal-not-installed when no Windows shell command is available', async () => {
    mocks.hasCommand.mockReturnValue(false)
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('rejects invalid Windows terminal paths', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('relative\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-path',
    })
  })
})
```

- [ ] **Step 2: Run Windows terminal backend tests and verify failure**

Run:

```bash
bun run test src/system/windows-terminal.test.ts
```

Expected: FAIL because `src/system/windows-terminal.ts` does not exist.

- [ ] **Step 3: Implement Windows terminal backend**

Create `src/system/windows-terminal.ts`:

```ts
import { execa } from 'execa'
import { statSync } from 'node:fs'
import { hasCommand } from '#/system/command.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
import type { ExecResult } from '#/shared/git-types.ts'

const OPEN_TIMEOUT_MS = 10_000

export function isWindowsTerminalAvailable(): boolean {
  return hasCommand('wt.exe') || hasCommand('powershell.exe')
}

function isUsableWindowsDirectory(p: string): boolean {
  const style = pathStyle(p)
  if (p.includes('\0') || (style !== 'windowsDriveAbsolute' && style !== 'windowsUncAbsolute')) return false
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export async function openInWindowsTerminal(p: string): Promise<ExecResult> {
  if (!isUsableWindowsDirectory(p)) return { ok: false, message: 'error.invalid-path' }
  if (hasCommand('wt.exe')) {
    try {
      await execa('wt.exe', ['-d', p], {
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
      })
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  if (hasCommand('powershell.exe')) {
    try {
      await execa('powershell.exe', ['-NoExit', '-Command', 'Set-Location -LiteralPath $args[0]', p], {
        timeout: OPEN_TIMEOUT_MS,
        forceKillAfterDelay: 500,
      })
      return { ok: true, message: p }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  return { ok: false, message: 'error.terminal-not-installed' }
}
```

- [ ] **Step 4: Wire terminal registry to Windows backend**

Modify `src/system/terminals.ts` imports:

```ts
import { isWindowsTerminalAvailable, openInWindowsTerminal } from '#/system/windows-terminal.ts'
```

Add platform helpers:

```ts
function isWin32(): boolean {
  return process.platform === 'win32'
}

function openInNativeTerminal(path: string): Promise<ExecResult> {
  if (isDarwin()) return openInAppleTerminal(path)
  if (isWin32()) return openInWindowsTerminal(path)
  return Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
}

function openRemoteInNativeTerminal(target: ExternalRemoteTerminalTarget): Promise<ExecResult> {
  if (isDarwin()) return openRemoteInAppleTerminal(target)
  return Promise.resolve({ ok: false, message: 'error.remote-terminal-not-supported' })
}
```

Update `backends`:

```ts
const backends: Record<ResolvedTerminalApp, TerminalBackend> = {
  ghostty: { isInstalled: isGhosttyInstalled, open: openInGhostty, openRemote: openRemoteInGhostty },
  terminal: { isInstalled: () => true, open: openInNativeTerminal, openRemote: openRemoteInNativeTerminal },
}
```

Update `getTerminalAppAvailability`:

```ts
export async function getTerminalAppAvailability(signal?: AbortSignal): Promise<TerminalAppAvailability> {
  if (isDarwin()) {
    return {
      ghostty: backends.ghostty.isInstalled(),
      terminal: await isAppleTerminalInstalled(signal),
    }
  }
  if (isWin32()) {
    return {
      ghostty: false,
      terminal: isWindowsTerminalAvailable(),
    }
  }
  return {
    ghostty: false,
    terminal: false,
  }
}
```

- [ ] **Step 5: Add terminal registry tests for Windows dispatch**

Extend `src/system/terminals.test.ts` mocks:

```ts
import { isWindowsTerminalAvailable, openInWindowsTerminal } from '#/system/windows-terminal.ts'

vi.mock('#/system/windows-terminal.ts', () => ({
  isWindowsTerminalAvailable: vi.fn(() => true),
  openInWindowsTerminal: vi.fn(async (path: string) => ({ ok: true, message: path })),
}))
```

Add tests inside `describe('openInPreferredTerminal')`:

```ts
test('opens native Windows terminal for the existing terminal preference on win32', async () => {
  setPlatform('win32')
  vi.mocked(isWindowsTerminalAvailable).mockReturnValue(true)

  await expect(openInPreferredTerminal('C:\\repo', 'terminal')).resolves.toEqual({
    ok: true,
    message: 'C:\\repo',
  })

  expect(openInWindowsTerminal).toHaveBeenCalledWith('C:\\repo')
  expect(openInAppleTerminal).not.toHaveBeenCalled()
})

test('reports terminal-not-installed on win32 when no Windows terminal is available', async () => {
  setPlatform('win32')
  vi.mocked(isWindowsTerminalAvailable).mockReturnValue(false)

  await expect(openInPreferredTerminal('C:\\repo', 'terminal')).resolves.toEqual({
    ok: false,
    message: 'error.terminal-not-installed',
  })

  expect(openInWindowsTerminal).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Run terminal tests**

Run:

```bash
bun run test src/system/windows-terminal.test.ts src/system/terminals.test.ts src/system/external-apps.test.ts
```

Expected: PASS.

## Task 7: Windows Display Path Regression Tests

**Files:**
- Modify: `src/web/lib/paths.test.ts`

- [ ] **Step 1: Add regression tests for Windows path display**

Extend `src/web/lib/paths.test.ts`:

```ts
describe('formatWorktreePath Windows paths', () => {
  test('shows Windows worktree paths relative to the repository root', () => {
    expect(formatWorktreePath('C:\\repo', undefined, 'C:\\repo')).toBe('.')
    expect(formatWorktreePath('C:\\repo\\packages\\app', undefined, 'C:\\repo')).toBe('packages\\app')
    expect(formatWorktreePath('C:\\repo-feature', undefined, 'C:\\repo')).toBe('..\\repo-feature')
  })

  test('compares Windows display path segments case-insensitively', () => {
    expect(formatWorktreePath('C:\\Repo\\packages\\app', undefined, 'c:\\repo')).toBe('packages\\app')
  })
})

describe('defaultWorktreePath Windows paths', () => {
  test('derives Windows sibling worktree paths for nested repositories', () => {
    expect(defaultWorktreePath('C:\\Users\\dev\\repo', 'feature/path')).toBe('C:\\Users\\dev\\repo-feature-path')
  })
})
```

- [ ] **Step 2: Run display path tests and verify the case-insensitive test fails**

Run:

```bash
bun run test src/web/lib/paths.test.ts
```

Expected: FAIL for `compares Windows display path segments case-insensitively` because `relativeWindowsPath` currently compares Windows path parts with exact case.

- [ ] **Step 3: Make Windows relative display path comparison case-insensitive**

Modify `relativeParts` in `src/web/lib/paths.ts` to accept a comparison mode:

```ts
function relativePosixPath(fromPath: string, toPath: string): string | null {
  if (!fromPath.startsWith('/') || !toPath.startsWith('/')) return null
  const fromParts = posixPathParts(fromPath)
  const toParts = posixPathParts(toPath)
  return relativeParts(fromParts, toParts, '/', false)
}
```

```ts
function relativeWindowsPath(fromPath: string, toPath: string): string | null {
  const from = windowsPathParts(fromPath)
  const to = windowsPathParts(toPath)
  if (!from || !to || from.drive !== to.drive) return null
  return relativeParts(from.parts, to.parts, '\\', true)
}
```

```ts
function relativeParts(fromParts: string[], toParts: string[], separator: string, insensitive: boolean): string {
  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length &&
    partsEqual(fromParts[common] ?? '', toParts[common] ?? '', insensitive)
  ) {
    common += 1
  }

  const up = Array.from({ length: fromParts.length - common }, () => '..')
  const down = toParts.slice(common)
  return [...up, ...down].join(separator) || '.'
}

function partsEqual(a: string, b: string, insensitive: boolean): boolean {
  return insensitive ? a.toLowerCase() === b.toLowerCase() : a === b
}
```

- [ ] **Step 4: Run display path tests**

Run:

```bash
bun run test src/web/lib/paths.test.ts
```

Expected: PASS.

## Task 8: Focused Regression Verification

**Files:**
- No source edits.

- [ ] **Step 1: Run focused test set**

Run:

```bash
bun run test src/shared/path-semantics.test.ts src/shared/file-path-target.test.ts src/web/components/terminal/terminal-path-links.test.ts src/web/lib/editor-open-targets.test.ts src/web/lib/paths.test.ts src/system/open-app.test.ts src/system/windows-terminal.test.ts src/system/terminals.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Inspect final working tree**

Run:

```bash
git status --short
```

Expected: only intentional files from this plan are modified or added. Do not commit unless the user explicitly asks.

## Manual Windows Verification

- [ ] Open a local repository at `C:\Users\dev\repo`.
- [ ] Confirm file tree listing and normal Git reads work.
- [ ] Create a worktree and confirm the default path resembles `C:\Users\dev\repo-feature-name`.
- [ ] Print `C:\Users\dev\repo\src\app.ts:12` in the terminal.
- [ ] Single-click the terminal path and confirm the file tree reveals `src/app.ts`.
- [ ] Double-click the terminal path and confirm the configured editor opens at line 12.
- [ ] Use the external terminal action and confirm Windows Terminal opens in the worktree directory.
- [ ] Temporarily make `wt.exe` unavailable and confirm PowerShell opens in the worktree directory.
- [ ] Configure VS Code, Cursor, or Windsurf and confirm file tree/editor opens use the selected CLI.
