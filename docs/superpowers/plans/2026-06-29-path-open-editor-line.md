# Path Open In Editor With Line Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File paths in terminal output and plain text path displays reveal in the file tree on single click and open in the configured editor on double click, preserving optional `:line` and `:line:column` targets.

**Architecture:** Add one shared parser for repository-relative path targets, then thread structured editor targets through the existing web client, server route, server module, and VS Code-family system opener. Renderer components only resolve relative paths against the active worktree and choose reveal vs editor-open intent; server/system code owns validation and CLI arguments.

**Tech Stack:** TypeScript strip-only mode, React 19, Hono routes, Vitest, Electron server-first editor open flow, VS Code-family CLI `--goto`.

**Project Constraint:** Do not add git commit or branch steps. `AGENTS.md` explicitly says not to plan or execute git commits/branches unless the user asks.

---

## File Structure

- Create `src/shared/file-path-target.ts`: parser and formatter for repository-relative path targets and editor-open targets.
- Create `src/shared/file-path-target.test.ts`: parser/formatter tests.
- Modify `src/system/open-app.ts`: accept structured editor targets and emit `--goto` CLI arguments only when a line exists.
- Modify `src/system/open-app.test.ts`: local and remote `--goto` coverage.
- Modify `src/system/editors.ts`: pass structured targets through preferred editor dispatch.
- Modify `src/system/editors.test.ts`: preferred remote editor receives structured targets unchanged.
- Modify `src/server/modules/repo-write-paths.ts`: make `openRepositoryEditor` accept an editor target.
- Modify `src/server/modules/remote.ts`: make `openServerRemoteEditor` accept a structured target while preserving `worktreePath`.
- Modify `src/server/routes/repo.ts`: parse `/open-editor` body as legacy `{ path }` or new `{ target }`.
- Modify `src/server/routes/remote.ts`: parse `/open-editor` body as legacy `{ worktreePath }` or new `{ target }`.
- Modify route/module tests under `src/server/**`: verify legacy and structured bodies.
- Modify `src/web/repo-client.ts` and `src/web/remote-client.ts`: accept `EditorOpenTarget`.
- Modify web client tests: verify request bodies.
- Create `src/web/lib/editor-open-targets.ts`: resolve relative targets against a worktree path and dispatch to local or remote editor client.
- Create `src/web/lib/editor-open-targets.test.ts`: local/remote dispatch tests.
- Create `src/web/components/PathTargetText.tsx`: render arbitrary text with clickable/double-clickable path target spans.
- Create `src/web/components/PathTargetText.test.tsx`: click/double-click behavior tests.
- Modify `src/web/components/FilePathText.tsx`: add optional click/double-click handlers while preserving measurement.
- Modify `src/web/components/FilePathText.test.tsx`: verify interactive props do not break ellipsis.
- Modify `src/web/components/StatusList.tsx`: path rows use double click to open editor targets.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.tsx`: pass worktree-aware editor opener to `StatusList`.
- Modify `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`: pass selected worktree path into commit file rows and use double-click editor open.
- Modify `src/web/components/terminal/types.ts`: add `onOpenPathInEditor`.
- Modify `src/web/components/terminal/terminal-path-links.ts`: return structured line targets and distinguish single vs double activation via `MouseEvent.detail`.
- Modify terminal tests under `src/web/components/terminal/**`: reveal on single click, editor open on double click.
- Modify `src/web/components/terminal/terminal-session-view.ts`, `ManagedTerminalSession.ts`, and `TerminalSlot.tsx`: wire editor-open handlers and show toast on failures.
- Modify `src/web/components/branch-detail/BranchDetailContent.tsx` only if `TerminalSlot` needs an explicit callback; prefer keeping editor dispatch inside `TerminalSlot`.

---

### Task 1: Shared Path Target Parser

**Files:**
- Create: `src/shared/file-path-target.ts`
- Create: `src/shared/file-path-target.test.ts`
- Modify: `src/web/components/terminal/terminal-path-links.ts`
- Modify: `src/web/components/terminal/terminal-path-links.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/shared/file-path-target.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  editorTargetPathArgument,
  filePathTargetsForText,
  parseFilePathTarget,
} from '#/shared/file-path-target.ts'

describe('parseFilePathTarget', () => {
  test('accepts relative paths with optional line and column targets', () => {
    expect(parseFilePathTarget('src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('./src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('"docs/guide.md",')).toEqual({ path: 'docs/guide.md' })
    expect(parseFilePathTarget('src/app.ts:12')).toEqual({ path: 'src/app.ts', line: 12 })
    expect(parseFilePathTarget('src/app.ts:12:3')).toEqual({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('rejects unsafe or ambiguous path targets', () => {
    expect(parseFilePathTarget('')).toBeNull()
    expect(parseFilePathTarget('https://example.com/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('/repo/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('C:\\repo\\src\\app.ts')).toBeNull()
    expect(parseFilePathTarget('../src/app.ts')).toBeNull()
    expect(parseFilePathTarget('src/../app.ts')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:')).toBeNull()
  })
})

describe('filePathTargetsForText', () => {
  test('finds path-like spans and preserves offsets', () => {
    expect(filePathTargetsForText('see src/app.ts:12 and ./docs/guide.md')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startIndex: 4, endIndex: 17 },
      { text: './docs/guide.md', target: { path: 'docs/guide.md' }, startIndex: 22, endIndex: 37 },
    ])
  })
})

describe('editorTargetPathArgument', () => {
  test('adds line and column only when a line target exists', () => {
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts' })).toBe('/repo/src/app.ts')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12 })).toBe('/repo/src/app.ts:12')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12, column: 3 })).toBe('/repo/src/app.ts:12:3')
  })
})
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `bun run test src/shared/file-path-target.test.ts`

Expected: FAIL because `src/shared/file-path-target.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/shared/file-path-target.ts`:

```ts
export interface FilePathTarget {
  path: string
  line?: number
  column?: number
}

export interface FilePathTargetSpan {
  text: string
  target: FilePathTarget
  startIndex: number
  endIndex: number
}

export type EditorOpenTarget = string | FilePathTarget

const PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<])(?<token>(?:\.\/)?(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>])/gu
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const LEADING_PUNCTUATION_PATTERN = /^[`"'([{<]+/u
const TRAILING_PUNCTUATION_PATTERN = /[`"',;)\]}>]+$/u
const LINE_TARGET_PATTERN = /^(?<path>.+):(?<line>\d+)(?::(?<column>\d+))?$/u
const INVALID_COLON_SUFFIX_PATTERN = /:\d*:?\d*$/u

function safePositiveInteger(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function splitLineTarget(value: string): FilePathTarget | null {
  const match = LINE_TARGET_PATTERN.exec(value)
  if (!match) {
    if (INVALID_COLON_SUFFIX_PATTERN.test(value)) return null
    return { path: value }
  }

  const path = match.groups?.path ?? ''
  const line = safePositiveInteger(match.groups?.line)
  if (line === null) return null
  const column = safePositiveInteger(match.groups?.column)
  if (match.groups?.column !== undefined && column === null) return null
  return column === null ? { path, line } : { path, line, column }
}

export function parseFilePathTarget(raw: string): FilePathTarget | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) return null

  const target = splitLineTarget(trimmed)
  if (!target) return null

  let relativePath = target.path
  while (relativePath.startsWith('./')) relativePath = relativePath.slice(2)
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) return null

  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return target.column === undefined
    ? target.line === undefined
      ? { path: relativePath }
      : { path: relativePath, line: target.line }
    : { path: relativePath, line: target.line, column: target.column }
}

export function filePathTargetsForText(text: string): FilePathTargetSpan[] {
  const spans: FilePathTargetSpan[] = []
  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const target = parseFilePathTarget(token)
    if (!target) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    spans.push({ text: token, target, startIndex, endIndex: startIndex + token.length })
  }
  return spans
}

export function editorTargetPath(target: EditorOpenTarget): string {
  return typeof target === 'string' ? target : target.path
}

export function editorTargetPathArgument(target: EditorOpenTarget): string {
  if (typeof target === 'string' || target.line === undefined) return editorTargetPath(target)
  return target.column === undefined ? `${target.path}:${target.line}` : `${target.path}:${target.line}:${target.column}`
}
```

- [ ] **Step 4: Update terminal path link tests for structured targets**

Modify `src/web/components/terminal/terminal-path-links.test.ts` imports and expectations:

```ts
import { parseFilePathTarget } from '#/shared/file-path-target.ts'
import {
  registerTerminalRelativePathLinkProvider,
  terminalRelativePathLinksForLine,
} from '#/web/components/terminal/terminal-path-links.ts'
```

Replace `normalizeTerminalRelativePath` tests with parser tests already covered in `src/shared/file-path-target.test.ts`. Update the line-link expectation:

```ts
expect(terminalRelativePathLinksForLine('created src/app.ts:12 and ./docs/guide.md')).toEqual([
  { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startColumn: 9, endColumn: 21 },
  { text: './docs/guide.md', target: { path: 'docs/guide.md' }, startColumn: 27, endColumn: 41 },
])
expect(parseFilePathTarget('https://example.com/a.ts')).toBeNull()
```

- [ ] **Step 5: Update terminal link provider implementation**

Modify `src/web/components/terminal/terminal-path-links.ts` to use the shared parser:

```ts
import type { ILink, ILinkProvider } from '@xterm/xterm'
import { filePathTargetsForText, parseFilePathTarget, type FilePathTarget } from '#/shared/file-path-target.ts'

type RevealPathHandler = (relativePath: string) => void
type OpenPathInEditorHandler = (target: FilePathTarget) => void
```

Change `TerminalRelativePathLink`:

```ts
export interface TerminalRelativePathLink {
  text: string
  target: FilePathTarget
  startColumn: number
  endColumn: number
}
```

Replace `terminalRelativePathLinksForLine`:

```ts
export function terminalRelativePathLinksForLine(line: string): TerminalRelativePathLink[] {
  return filePathTargetsForText(line).map((span) => ({
    text: span.text,
    target: span.target,
    startColumn: span.startIndex + 1,
    endColumn: span.endIndex,
  }))
}
```

Change `registerTerminalRelativePathLinkProvider` signature and activation:

```ts
export function registerTerminalRelativePathLinkProvider(
  term: TerminalLinkProviderHost,
  getRevealPathHandler: () => RevealPathHandler | null,
  getOpenPathInEditorHandler: () => OpenPathInEditorHandler | null,
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
      const links = terminalRelativePathLinksForLine(line).map<ILink>((link) => ({
        range: {
          start: { x: link.startColumn, y: bufferLineNumber },
          end: { x: link.endColumn, y: bufferLineNumber },
        },
        text: link.text,
        decorations: { pointerCursor: true, underline: true },
        activate: (event, text) => {
          const target = parseFilePathTarget(text)
          if (!target) return
          if (event instanceof MouseEvent && event.detail >= 2) {
            getOpenPathInEditorHandler()?.(target)
            return
          }
          getRevealPathHandler()?.(target.path)
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
  return term.registerLinkProvider(provider)
}
```

- [ ] **Step 6: Run parser and terminal path tests**

Run: `bun run test src/shared/file-path-target.test.ts src/web/components/terminal/terminal-path-links.test.ts`

Expected: PASS.

---

### Task 2: Editor Backend Structured Targets

**Files:**
- Modify: `src/system/open-app.ts`
- Modify: `src/system/open-app.test.ts`
- Modify: `src/system/vscode.ts`
- Modify: `src/system/cursor.ts`
- Modify: `src/system/windsurf.ts`
- Modify: `src/system/editors.ts`
- Modify: `src/system/editors.test.ts`

- [ ] **Step 1: Add failing `--goto` tests**

Append to `src/system/open-app.test.ts` inside `describe('openByAppCli', ...)`:

```ts
  test('opens an existing file path at a line and column with --goto', async () => {
    const { openByAppCli } = await import('#/system/open-app.ts')

    await expect(
      openByAppCli('Visual Studio Code', 'code', { path: '/repo/src/app.ts', line: 12, column: 3 }),
    ).resolves.toEqual({ ok: true, message: '/repo/src/app.ts' })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['--goto', '/repo/src/app.ts:12:3'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })
```

Append to `describe('openRemoteByAppCli', ...)`:

```ts
  test('opens a remote file at a line target with --goto', async () => {
    const { openRemoteByAppCli } = await import('#/system/open-app.ts')

    await expect(
      openRemoteByAppCli('Visual Studio Code', 'code', 'prod', { path: '/srv/repo/src/app.ts', line: 12 }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo/src/app.ts' })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['--remote', 'ssh-remote+prod', '--goto', '/srv/repo/src/app.ts:12'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })
```

- [ ] **Step 2: Run backend tests and verify failure**

Run: `bun run test src/system/open-app.test.ts`

Expected: FAIL because `openByAppCli` and `openRemoteByAppCli` only accept strings and never add `--goto`.

- [ ] **Step 3: Implement structured target support in `open-app`**

Modify `src/system/open-app.ts` imports:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import { editorTargetPath, editorTargetPathArgument } from '#/shared/file-path-target.ts'
```

Change `openByAppCli`:

```ts
export function openByAppCli(
  appName: string,
  cliName: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  const targetPath = editorTargetPath(target)
  if (!isUsableEditorPath(targetPath)) return Promise.resolve({ ok: false, message: 'error.invalid-path' })

  const cli = resolveAppCli(appName, cliName)
  if (!cli) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  const args = typeof target === 'string' || target.line === undefined
    ? [targetPath]
    : ['--goto', editorTargetPathArgument(target)]

  return execa(cli, args, {
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

Change `openRemoteByAppCli`:

```ts
export function openRemoteByAppCli(
  appName: string,
  cliName: string,
  alias: string,
  target: EditorOpenTarget,
): Promise<{ ok: boolean; message: string }> {
  const remotePath = editorTargetPath(target)
  if (!isSafeRemoteAlias(alias) || !isSafeRemoteAbsolutePath(remotePath)) {
    return Promise.resolve({ ok: false, message: 'error.invalid-arguments' })
  }

  const cli = resolveAppCli(appName, cliName)
  if (!cli) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  const args = typeof target === 'string' || target.line === undefined
    ? ['--remote', `ssh-remote+${alias}`, remotePath]
    : ['--remote', `ssh-remote+${alias}`, '--goto', editorTargetPathArgument(target)]

  return execa(cli, args, {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.remote-editor-not-supported'
      return { ok: false, message }
    }
    return { ok: true, message: remotePath }
  })
}
```

- [ ] **Step 4: Thread types through editor wrappers**

In `src/system/vscode.ts`, `src/system/cursor.ts`, and `src/system/windsurf.ts`, import `EditorOpenTarget` and change local/remote opener parameters from `string` to `EditorOpenTarget`:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
```

Example for VS Code:

```ts
export function openInVSCode(target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openByAppCli(APP_NAME, CLI_NAME, target)
}

export function openRemoteInVSCode(alias: string, target: EditorOpenTarget): Promise<{ ok: boolean; message: string }> {
  return openRemoteByAppCli(APP_NAME, CLI_NAME, alias, target)
}
```

Apply the same shape for Cursor and Windsurf.

- [ ] **Step 5: Update editor registry types**

Modify `src/system/editors.ts`:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
```

Change `EditorBackend`:

```ts
open: (target: EditorOpenTarget) => Promise<{ ok: boolean; message: string }>
openRemote?: (alias: string, target: EditorOpenTarget) => Promise<{ ok: boolean; message: string }>
```

Change exported functions:

```ts
export function openInPreferredEditor(
  target: EditorOpenTarget,
  pref: EditorPref,
): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveEditorApp(pref, getEditorAppAvailability())
  return resolved ? backends[resolved].open(target) : Promise.resolve({ ok: false, message: 'error.editor-not-installed' })
}

export function openRemoteInPreferredEditor(
  alias: string,
  target: EditorOpenTarget,
  pref: EditorPref,
): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveEditorApp(pref, getEditorAppAvailability())
  if (!resolved) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })
  const openRemote = backends[resolved].openRemote
  return openRemote
    ? openRemote(alias, target)
    : Promise.resolve({ ok: false, message: 'error.remote-editor-not-supported' })
}
```

- [ ] **Step 6: Update preferred editor tests**

In `src/system/editors.test.ts`, add:

```ts
  test('passes structured remote targets to the selected editor', async () => {
    mocks.cursorInstalled.mockReturnValue(true)
    const { openRemoteInPreferredEditor } = await import('#/system/editors.ts')

    await openRemoteInPreferredEditor('prod', { path: '/srv/repo/src/app.ts', line: 12 }, 'cursor')

    expect(mocks.openRemoteCursor).toHaveBeenCalledWith('prod', { path: '/srv/repo/src/app.ts', line: 12 })
  })
```

- [ ] **Step 7: Run system tests**

Run: `bun run test src/system/open-app.test.ts src/system/editors.test.ts`

Expected: PASS.

---

### Task 3: Server And Client Editor Target API

**Files:**
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/remote.ts`
- Modify: `src/server/modules/remote.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/server/routes/remote.ts`
- Modify: `src/server/routes/remote.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`
- Modify: `src/web/remote-client.ts`
- Modify: `src/web/remote-client.test.ts`

- [ ] **Step 1: Add route tests for structured bodies**

In `src/server/routes/repo.test.ts`, add `openRepositoryEditor` to hoisted mocks:

```ts
openRepositoryEditor: vi.fn(),
```

Use it in the `repo-write-paths` mock:

```ts
openRepositoryEditor: mocks.openRepositoryEditor,
```

In `beforeEach`, add:

```ts
mocks.openRepositoryEditor.mockResolvedValue({ ok: true, message: '/repo/src/app.ts' })
```

Add test:

```ts
  test('routes structured repository editor targets', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/open-editor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { path: '/repo/src/app.ts', line: 12, column: 3 } }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/repo/src/app.ts' })
    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith({ path: '/repo/src/app.ts', line: 12, column: 3 })
  })
```

In `src/server/routes/remote.test.ts`, add:

```ts
  test('opens a remote editor from repo id and structured target', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const app = createRemoteRoutes()

    const response = await app.request('http://localhost/open-editor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoId: 'ssh-config://prod/srv/repo',
        target: { path: '/srv/repo/src/app.ts', line: 12 },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })
    expect(mocks.openServerRemoteEditor).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', target: { path: '/srv/repo/src/app.ts', line: 12 } },
      expect.any(AbortSignal),
    )
  })
```

- [ ] **Step 2: Run route tests and verify failure**

Run: `bun run test src/server/routes/repo.test.ts src/server/routes/remote.test.ts`

Expected: FAIL because routes only parse `path` and `worktreePath`.

- [ ] **Step 3: Add route body target parser helpers**

In `src/server/routes/repo.ts`, import:

```ts
import type { FilePathTarget } from '#/shared/file-path-target.ts'
```

Add helper near `boundedInt`:

```ts
function routeEditorTarget(value: unknown): FilePathTarget | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.path !== 'string') return null
  const target: FilePathTarget = { path: input.path }
  if (typeof input.line === 'number' && Number.isSafeInteger(input.line) && input.line > 0) target.line = input.line
  if (typeof input.column === 'number' && Number.isSafeInteger(input.column) && input.column > 0) target.column = input.column
  return target
}
```

Change `/open-editor`:

```ts
  app.post('/open-editor', async (c) => {
    const body = await c.req.json().catch(() => null)
    const target = routeEditorTarget(body?.target)
    const path = typeof body?.path === 'string' ? body.path : ''
    return c.json(
      await jsonOr(
        () => openRepositoryEditor(target ?? path),
        { ok: false, message: 'error.failed-read-repo' },
        'open-editor',
      ),
    )
  })
```

In `src/server/routes/remote.ts`, import `FilePathTarget`, add the same `routeEditorTarget` helper, and change `/open-editor`:

```ts
  app.post('/open-editor', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const target = routeEditorTarget(body?.target)
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    return c.json(await openServerRemoteEditor(target ? { repoId, target } : { repoId, worktreePath }, c.req.raw.signal))
  })
```

- [ ] **Step 4: Update server modules**

In `src/server/modules/repo-write-paths.ts`, import `EditorOpenTarget`:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
```

Change:

```ts
export async function openRepositoryEditor(target: EditorOpenTarget): Promise<ExecResult> {
  const prefs = await getServerSettingsPrefs()
  return await openInPreferredEditor(target, prefs.editorApp)
}
```

In `src/server/modules/remote.ts`, import:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import { editorTargetPath } from '#/shared/file-path-target.ts'
```

Change signature and body:

```ts
export async function openServerRemoteEditor(
  input: { repoId: string; worktreePath: string } | { repoId: string; target: EditorOpenTarget },
  signal?: AbortSignal,
): Promise<ExecResult> {
  const target = 'target' in input ? input.target : input.worktreePath
  const remotePath = editorTargetPath(target)
  if (!isRemoteRepoId(input.repoId) || !isAbsoluteRemotePath(remotePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const ref = parseRemoteRepoId(input.repoId)
  if (!ref) return { ok: false, message: 'error.invalid-arguments' }

  let resolved: ResolvedRemoteTarget
  try {
    resolved = await resolveSshRemoteTarget(ref, signal)
  } catch {
    return { ok: false, message: 'error.ssh-config-changed' }
  }

  const prefs = await getServerSettingsPrefs()
  return await openRemoteInPreferredEditor(resolved.target.alias, target, prefs.editorApp)
}
```

- [ ] **Step 5: Add module test for structured remote target**

In `src/server/modules/remote.test.ts`, add:

```ts
  test('opens a structured remote editor target', async () => {
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteEditor({
        repoId: 'ssh-config://prod/srv/repo',
        target: { path: '/srv/repo/src/app.ts', line: 12 },
      }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })

    expect(mocks.openRemoteInPreferredEditor).toHaveBeenCalledWith(
      'prod',
      { path: '/srv/repo/src/app.ts', line: 12 },
      'vscode',
    )
  })
```

- [ ] **Step 6: Update web clients**

In `src/web/repo-client.ts`, import `EditorOpenTarget`:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
```

Change:

```ts
export async function openRepositoryEditor(target: EditorOpenTarget): Promise<ExecResult> {
  return await postServerJson('/api/repo/open-editor', typeof target === 'string' ? { path: target } : { target })
}
```

In `src/web/remote-client.ts`, import and change:

```ts
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'

export async function openRemoteRepositoryEditor(repoId: string, target: EditorOpenTarget): Promise<ExecResult> {
  return await postServerJson('/api/remote/open-editor', typeof target === 'string' ? { repoId, worktreePath: target } : { repoId, target })
}
```

- [ ] **Step 7: Update web client tests**

In `src/web/repo-client.test.ts`, add an assertion after existing legacy open-editor assertions:

```ts
await expect(openRepositoryEditor({ path: '/tmp/repo/src/app.ts', line: 12 })).resolves.toEqual({
  ok: true,
  message: 'server-editor',
})
expect(fetchMock).toHaveBeenLastCalledWith(
  'http://127.0.0.1:32100/api/repo/open-editor',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
    body: JSON.stringify({ target: { path: '/tmp/repo/src/app.ts', line: 12 } }),
  }),
)
```

In `src/web/remote-client.test.ts`, add:

```ts
await expect(
  openRemoteRepositoryEditor('ssh-config://prod/srv/repo', { path: '/srv/repo/src/app.ts', line: 12 }),
).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })
expect(fetchMock).toHaveBeenLastCalledWith(
  'http://127.0.0.1:32100/api/remote/open-editor',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
    body: JSON.stringify({
      repoId: 'ssh-config://prod/srv/repo',
      target: { path: '/srv/repo/src/app.ts', line: 12 },
    }),
  }),
)
```

- [ ] **Step 8: Run API tests**

Run: `bun run test src/server/routes/repo.test.ts src/server/routes/remote.test.ts src/server/modules/remote.test.ts src/web/repo-client.test.ts src/web/remote-client.test.ts`

Expected: PASS.

---

### Task 4: Renderer Editor Target Helpers And Plain Text Paths

**Files:**
- Create: `src/web/lib/editor-open-targets.ts`
- Create: `src/web/lib/editor-open-targets.test.ts`
- Create: `src/web/components/PathTargetText.tsx`
- Create: `src/web/components/PathTargetText.test.tsx`
- Modify: `src/web/components/FilePathText.tsx`
- Modify: `src/web/components/FilePathText.test.tsx`

- [ ] **Step 1: Write editor helper tests**

Create `src/web/lib/editor-open-targets.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openRepositoryEditor: vi.fn(),
  openRemoteRepositoryEditor: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({ openRepositoryEditor: mocks.openRepositoryEditor }))
vi.mock('#/web/remote-client.ts', () => ({ openRemoteRepositoryEditor: mocks.openRemoteRepositoryEditor }))

describe('openWorktreeEditorTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openRepositoryEditor.mockResolvedValue({ ok: true, message: '/repo/src/app.ts' })
    mocks.openRemoteRepositoryEditor.mockResolvedValue({ ok: true, message: '/srv/repo/src/app.ts' })
  })

  test('resolves relative targets against local worktree paths', async () => {
    const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

    await openWorktreeEditorTarget('/repo', '/repo', { path: 'src/app.ts', line: 12 })

    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith({ path: '/repo/src/app.ts', line: 12 })
    expect(mocks.openRemoteRepositoryEditor).not.toHaveBeenCalled()
  })

  test('resolves relative targets against remote worktree paths', async () => {
    const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

    await openWorktreeEditorTarget('ssh-config://prod/srv/repo', '/srv/repo', { path: 'src/app.ts', line: 12, column: 3 })

    expect(mocks.openRemoteRepositoryEditor).toHaveBeenCalledWith('ssh-config://prod/srv/repo', {
      path: '/srv/repo/src/app.ts',
      line: 12,
      column: 3,
    })
    expect(mocks.openRepositoryEditor).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement editor helper**

Create `src/web/lib/editor-open-targets.ts`:

```ts
import type { EditorOpenTarget, FilePathTarget } from '#/shared/file-path-target.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { openRepositoryEditor } from '#/web/repo-client.ts'
import { openRemoteRepositoryEditor } from '#/web/remote-client.ts'
import { joinPath } from '#/web/lib/paths.ts'

export function resolveWorktreeEditorTarget(worktreePath: string, target: FilePathTarget): FilePathTarget {
  return {
    ...target,
    path: joinPath(worktreePath, target.path),
  }
}

export async function openWorktreeEditorTarget(
  repoId: string,
  worktreePath: string,
  target: FilePathTarget,
): Promise<ExecResult> {
  const resolved: EditorOpenTarget = resolveWorktreeEditorTarget(worktreePath, target)
  return isRemoteRepoId(repoId) ? await openRemoteRepositoryEditor(repoId, resolved) : await openRepositoryEditor(resolved)
}
```

- [ ] **Step 3: Write `PathTargetText` tests**

Create `src/web/components/PathTargetText.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PathTargetText } from '#/web/components/PathTargetText.tsx'

describe('PathTargetText', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('renders path spans and dispatches click and double click targets', async () => {
    const onRevealPath = vi.fn()
    const onOpenPathInEditor = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    await act(async () => {
      root.render(
        <PathTargetText
          text="see src/app.ts:12"
          onRevealPath={onRevealPath}
          onOpenPathInEditor={onOpenPathInEditor}
        />,
      )
    })

    try {
      const path = container.querySelector('[data-path-target]')
      expect(path?.textContent).toBe('src/app.ts:12')

      await act(async () => {
        path?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')

      await act(async () => {
        path?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      })
      expect(onOpenPathInEditor).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12 })
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
```

- [ ] **Step 4: Implement `PathTargetText`**

Create `src/web/components/PathTargetText.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { filePathTargetsForText } from '#/shared/file-path-target.ts'
import { cn } from '#/web/lib/cn.ts'

interface PathTargetTextProps {
  text: string
  className?: string
  onRevealPath?: (relativePath: string) => void
  onOpenPathInEditor?: (target: FilePathTarget) => void
}

export function PathTargetText({ text, className, onRevealPath, onOpenPathInEditor }: PathTargetTextProps) {
  const spans = filePathTargetsForText(text)
  if (spans.length === 0) return <span className={className}>{text}</span>

  const nodes: ReactNode[] = []
  let cursor = 0
  spans.forEach((span, index) => {
    if (span.startIndex > cursor) nodes.push(text.slice(cursor, span.startIndex))
    nodes.push(
      <span
        key={`${span.startIndex}:${index}`}
        data-path-target={span.target.path}
        role="link"
        tabIndex={0}
        className="cursor-pointer text-brand-text underline decoration-border underline-offset-2 hover:decoration-brand-text"
        onClick={() => onRevealPath?.(span.target.path)}
        onDoubleClick={() => onOpenPathInEditor?.(span.target)}
      >
        {span.text}
      </span>,
    )
    cursor = span.endIndex
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))

  return <span className={cn('whitespace-pre-wrap break-words', className)}>{nodes}</span>
}
```

- [ ] **Step 5: Add optional interactivity to `FilePathText`**

Modify `src/web/components/FilePathText.tsx` props:

```ts
import type { MouseEventHandler } from 'react'

interface Props {
  path: string
  className?: string
  onClick?: MouseEventHandler<HTMLSpanElement>
  onDoubleClick?: MouseEventHandler<HTMLSpanElement>
}
```

Change function signature and span:

```tsx
export function FilePathText({ path, className, onClick, onDoubleClick }: Props) {
```

```tsx
    <span
      ref={ref}
      className={cn(
        'block w-full min-w-0 overflow-hidden whitespace-nowrap text-sm text-foreground font-mono',
        (onClick || onDoubleClick) && 'cursor-pointer underline decoration-border underline-offset-2 hover:text-brand-text hover:decoration-brand-text',
        className,
      )}
      title={path}
      aria-label={path}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
```

- [ ] **Step 6: Add FilePathText interactive smoke test**

In `src/web/components/FilePathText.test.tsx`, add:

```tsx
  test('passes click and double click handlers through the measured span', async () => {
    const onClick = vi.fn()
    const onDoubleClick = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    await act(async () => {
      root.render(<FilePathText path="src/app.ts" onClick={onClick} onDoubleClick={onDoubleClick} />)
    })

    try {
      const span = container.querySelector('span')
      span?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      span?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onDoubleClick).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
```

- [ ] **Step 7: Run renderer helper tests**

Run: `bun run test src/web/lib/editor-open-targets.test.ts src/web/components/PathTargetText.test.tsx src/web/components/FilePathText.test.tsx`

Expected: PASS.

---

### Task 5: Status, Changes, And History Path Double Click

**Files:**
- Modify: `src/web/components/StatusList.tsx`
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`

- [ ] **Step 1: Extend `StatusList` props**

Modify `src/web/components/StatusList.tsx` imports:

```ts
import type { FilePathTarget } from '#/shared/file-path-target.ts'
```

Add prop:

```ts
onPathDoubleClick?: (target: FilePathTarget) => void
```

Thread it through `StatusWorktreeList` and `StatusTreeFileRow`.

- [ ] **Step 2: Update list row rendering**

In list mode, replace the button-wrapped `FilePathText` with:

```tsx
          <FilePathText
            path={entry.path}
            onClick={onPathClick ? () => onPathClick(entry.path) : undefined}
            onDoubleClick={onPathDoubleClick ? () => onPathDoubleClick({ path: entry.path }) : undefined}
          />
```

In tree mode `StatusTreeFileRow`, replace the button branch with:

```tsx
      <FilePathText
        path={row.path}
        className={FILE_TREE_FILE_NAME_CLASS}
        onClick={onPathClick ? () => onPathClick(row.path) : undefined}
        onDoubleClick={onPathDoubleClick ? () => onPathDoubleClick({ path: row.path }) : undefined}
      />
```

Keep `StatusCode` and checkbox layout unchanged.

- [ ] **Step 3: Add changes panel editor opener**

Modify `src/web/components/repo-workspace/ProjectChangesPanel.tsx` imports:

```ts
import { toast } from 'sonner'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { openWorktreeEditorTarget } from '#/web/lib/editor-open-targets.ts'
```

Inside `ProjectChangesPanel`, add:

```ts
  async function handleOpenPathInEditor(target: FilePathTarget) {
    const worktreePath = detail?.branch?.worktree?.path
    if (!worktreePath) return
    const result = await openWorktreeEditorTarget(repoId, worktreePath, target)
    if (!result.ok) toast.error(t(result.message))
  }
```

Pass to `ProjectChangesContent`:

```tsx
        onOpenPathInEditor={handleOpenPathInEditor}
```

Extend `ProjectChangesContent` props and pass to `StatusList`:

```tsx
            onPathDoubleClick={onOpenPathInEditor}
```

- [ ] **Step 4: Add changes panel test coverage**

In `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`, mock `openWorktreeEditorTarget`:

```ts
const openWorktreeEditorTarget = vi.fn(async () => ({ ok: true as const, message: '' }))
vi.mock('#/web/lib/editor-open-targets.ts', () => ({
  openWorktreeEditorTarget: (repoId: string, worktreePath: string, target: unknown) =>
    openWorktreeEditorTarget(repoId, worktreePath, target),
}))
```

Add test:

```tsx
  test('opens changed file paths in the editor on double click', async () => {
    const onRevealPath = vi.fn()
    await act(async () => {
      root!.render(<ProjectChangesPanel repoId={REPO_ID} onRevealPath={onRevealPath} />)
    })

    const path = Array.from(document.body.querySelectorAll<HTMLElement>('[aria-label="src/app.ts"]')).at(0)
    expect(path).toBeDefined()

    await act(async () => {
      path?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    expect(openWorktreeEditorTarget).toHaveBeenCalledWith(REPO_ID, '/repo', { path: 'src/app.ts' })
  })
```

Use the worktree path already present in that test fixture; if the fixture uses a different path, use that exact value.

- [ ] **Step 5: Add history panel editor opener**

Modify `src/web/components/repo-workspace/ProjectHistoryPanel.tsx` imports:

```ts
import { toast } from 'sonner'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { openWorktreeEditorTarget } from '#/web/lib/editor-open-targets.ts'
```

Pass `worktreePath={view.worktreePath}` into `CommitDetailPane`.

Add props down to `CommitFileRow`:

```ts
worktreePath: string | null
onOpenPathInEditor?: (target: FilePathTarget) => void
```

In `ProjectHistoryPanel`, define:

```ts
  async function handleOpenPathInEditor(target: FilePathTarget) {
    if (!view.worktreePath) return
    const result = await openWorktreeEditorTarget(repoId, view.worktreePath, target)
    if (!result.ok) toast.error(t(result.message))
  }
```

Pass `onOpenPathInEditor={handleOpenPathInEditor}` into `CommitDetailPane`.

In `CommitFileRow`, add `onDoubleClick` to the clickable path row:

```tsx
          onDoubleClick={() => onOpenPathInEditor?.({ path: file.path })}
```

- [ ] **Step 6: Add history panel test coverage**

In `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`, mock `openWorktreeEditorTarget` as in changes tests. Add:

```tsx
  test('opens commit detail file paths in the editor on double click', async () => {
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })

    const row = Array.from(document.body.querySelectorAll<HTMLElement>('[aria-label="src/app.ts"]')).at(0)
    expect(row).toBeDefined()

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    expect(openWorktreeEditorTarget).toHaveBeenCalledWith(REPO_ID, '/repo', { path: 'src/app.ts' })
  })
```

Use the exact file and worktree path from the existing test fixture.

- [ ] **Step 7: Run panel tests**

Run: `bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`

Expected: PASS.

---

### Task 6: Terminal Double Click Editor Open

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Extend terminal attach handler type**

Modify `src/web/components/terminal/types.ts`:

```ts
import type { FilePathTarget } from '#/shared/file-path-target.ts'
```

Change:

```ts
export interface TerminalSessionAttachHandlers {
  onRevealPath?: (relativePath: string) => void
  onOpenPathInEditor?: (target: FilePathTarget) => void
}
```

- [ ] **Step 2: Wire `TerminalSessionView`**

In `src/web/components/terminal/terminal-session-view.ts`, import `FilePathTarget`, add field:

```ts
private openPathInEditorHandler: ((target: FilePathTarget) => void) | null = null
```

Add method:

```ts
setOpenPathInEditorHandler(handler: ((target: FilePathTarget) => void) | null): void {
  this.openPathInEditorHandler = handler
}
```

Change relative path link provider registration:

```ts
this.disposables.push(
  registerTerminalRelativePathLinkProvider(
    term,
    () => this.revealPathHandler,
    () => this.openPathInEditorHandler,
  ),
)
```

- [ ] **Step 3: Wire `ManagedTerminalSession`**

Modify `src/web/components/terminal/ManagedTerminalSession.ts` attach/detach:

```ts
  attach(host: HTMLElement, handlers?: TerminalSessionAttachHandlers): void {
    if (this.disposed) return
    this.view.setRevealPathHandler(handlers?.onRevealPath ?? null)
    this.view.setOpenPathInEditorHandler(handlers?.onOpenPathInEditor ?? null)
    this.view.attach(host)
```

```ts
  detach(host: HTMLElement, parkingRoot: HTMLElement): void {
    this.clearTerminalFocusIfOwned()
    this.view.setRevealPathHandler(null)
    this.view.setOpenPathInEditorHandler(null)
```

- [ ] **Step 4: Update managed session tests**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, update single-click test event:

```ts
links?.[0]?.activate(new MouseEvent('click', { detail: 1 }), 'src/app.ts:12')
expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
```

Add:

```ts
  test('opens relative terminal path links in the editor on double click', async () => {
    const onRevealPath = vi.fn()
    const onOpenPathInEditor = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)

    session.attach(host, { onRevealPath, onOpenPathInEditor })
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.bufferLines[0] = 'created src/app.ts:12:3'

    let links: Array<{ activate: (event: MouseEvent, text: string) => void; text: string }> | undefined
    term.linkProviders[0]?.provideLinks(1, (provided: unknown[] | undefined) => {
      links = provided as typeof links
    })
    links?.[0]?.activate(new MouseEvent('click', { detail: 2 }), 'src/app.ts:12:3')

    expect(onOpenPathInEditor).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12, column: 3 })
    expect(onRevealPath).not.toHaveBeenCalled()
    session.detach(host, document.createElement('div'))
    session.dispose({ closeSession: false })
  })
```

- [ ] **Step 5: Add editor opener in TerminalSlot**

Modify `src/web/components/terminal/TerminalSlot.tsx` imports:

```ts
import { toast } from 'sonner'
import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { openWorktreeEditorTarget } from '#/web/lib/editor-open-targets.ts'
```

Add callback inside `TerminalSlot`:

```ts
  const handleOpenPathInEditor = useCallback(
    async (target: FilePathTarget) => {
      const result = await openWorktreeEditorTarget(repoRoot, worktreePath, target)
      if (!result.ok) toast.error(t(result.message))
    },
    [repoRoot, t, worktreePath],
  )
```

Change attach call:

```ts
    attach(descriptor, host, { onRevealPath, onOpenPathInEditor: handleOpenPathInEditor })
```

Update dependency array:

```ts
  }, [attach, descriptor, detach, handleOpenPathInEditor, onRevealPath])
```

- [ ] **Step 6: Update TerminalSlot test**

In `src/web/components/terminal/TerminalSlot.test.tsx`, add this hoisted mock block after the existing `repoClientMocks` mock:

```ts
const editorOpenMocks = vi.hoisted(() => ({
  openWorktreeEditorTarget: vi.fn(async () => ({ ok: true as const, message: '' })),
}))

vi.mock('#/web/lib/editor-open-targets.ts', () => ({
  openWorktreeEditorTarget: (
    repoId: string,
    worktreePath: string,
    target: { path: string; line?: number; column?: number },
  ) => editorOpenMocks.openWorktreeEditorTarget(repoId, worktreePath, target),
}))
```

In `afterEach`, add:

```ts
  editorOpenMocks.openWorktreeEditorTarget.mockReset()
  editorOpenMocks.openWorktreeEditorTarget.mockResolvedValue({ ok: true, message: '' })
```

In `src/web/components/terminal/TerminalSlot.test.tsx`, change expectation:

```ts
expect(attach).toHaveBeenCalledWith(descriptor, expect.any(HTMLElement), {
  onRevealPath,
  onOpenPathInEditor: expect.any(Function),
})
```

Add a test that extracts the handler and verifies dispatch:

```tsx
  test('opens terminal path targets through the worktree editor helper', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const attach = vi.fn()
    const descriptor = {
      key: 'terminal-1',
      worktreeTerminalKey: '/repo\0/worktree',
      terminalId: 'terminal-1',
      index: 1,
      repoRoot: '/repo',
      branch: 'feature',
      worktreePath: '/worktree',
    }
    const worktreeSnapshot = {
      worktreeTerminalKey: '/repo\0/worktree',
      selectedDescriptor: descriptor,
      sessions: [{ ...descriptor, title: 'zsh', phase: 'open' as const, selected: true, hasBell: false }],
      count: 1,
    }
    const snapshot = { phase: 'open' as const, message: null, processName: 'zsh' }
    const context: TerminalSessionContextValue = {
      createTerminal: vi.fn(async () => 'terminal-1'),
      selectTerminal: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      clearBell: vi.fn(() => false),
      closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
      registerWorktreeHost: vi.fn(),
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
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const handlers = attach.mock.calls[0]?.[2]
      await act(async () => {
        await handlers.onOpenPathInEditor({ path: 'src/app.ts', line: 12 })
      })

      expect(editorOpenMocks.openWorktreeEditorTarget).toHaveBeenCalledWith('/repo', '/worktree', {
        path: 'src/app.ts',
        line: 12,
      })
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
```

- [ ] **Step 7: Run terminal tests**

Run: `bun run test src/web/components/terminal/terminal-path-links.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSlot.test.tsx`

Expected: PASS.

---

### Task 7: Full Verification

**Files:**
- No code files; verification only.

- [ ] **Step 1: Run architecture guard**

Run: `bun run check:architecture`

Expected: PASS. If it fails, fix imports so:

- `src/main/**` does not import `src/web/**` or `src/server/**`.
- `src/web/**` does not import `src/main/**`.
- `src/server/**` and `src/shared/**` do not import `electron`.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS. Pay attention to TypeScript strip-only constraints: do not introduce enums, namespaces with runtime code, parameter properties, or import aliases.

- [ ] **Step 3: Run full tests**

Run: `bun run test`

Expected: PASS.

- [ ] **Step 4: Manual verification**

Use the running app or dev build:

1. Open a local repository with a selected branch that has a worktree.
2. In terminal output, single-click `src/app.ts:12` and confirm the file tree reveals `src/app.ts`.
3. In terminal output, double-click `src/app.ts:12` and confirm the configured editor opens that file at line 12.
4. In Changes, single-click a changed file path and confirm reveal still works.
5. In Changes, double-click a changed file path and confirm the configured editor opens the file.
6. In History commit details, double-click a file path and confirm the configured editor opens the file.
7. Open a remote repository and double-click a remote terminal path; confirm the configured editor opens through Remote SSH.

---

## Self-Review

- Spec coverage: parser, single-click reveal, double-click editor open, line/column targets, local editor, remote editor, terminal output, and plain text path displays are covered.
- Scope check: no package dependency, Markdown renderer, shell cwd tracking, absolute outside-worktree path support, or built-in editor is introduced.
- Type consistency: `FilePathTarget` is the relative parsed target; `EditorOpenTarget` is the server/system editor input; renderer helper resolves relative path targets into absolute editor targets.
- Project constraint: no git commit or branch steps are included.
