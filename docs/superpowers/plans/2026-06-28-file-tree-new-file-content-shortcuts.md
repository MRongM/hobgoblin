# File Tree New File And Content Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-tree new-file creation plus single-text-file `Cmd/Ctrl+Shift+C/V` content copy and replace.

**Architecture:** Keep renderer code responsible for UI state, shortcuts, clipboard access, and toast feedback only. Put every filesystem read/write behind existing repo client, server route, repo module, and local/remote system-helper boundaries. Reuse existing file-tree containment and remote command patterns; do not introduce a file editor or multi-file content workflow.

**Tech Stack:** TypeScript strip-only Node.js, React, Vitest, Hono routes, Electron/browser clipboard, existing SSH command runner, Sonner toasts.

---

## Project Instruction Override

The project `AGENTS.md` says not to plan or execute git commits unless the user explicitly asks. This plan therefore uses verification checkpoints instead of commit steps.

## File Structure

- Modify `src/shared/file-tree.ts`: add text-file size limit, request/result types, and runtime request guards.
- Modify `src/system/file-tree/local.ts`: add local empty-file creation, UTF-8 text read, and UTF-8 text replace helpers.
- Modify `src/system/file-tree/local.test.ts`: cover local helper success, path safety, text limits, binary/NUL rejection, and previous-content return.
- Modify `src/system/ssh/commands.ts`: add fixed remote command kinds and Python scripts for remote empty-file creation, text read, and text replace.
- Modify `src/system/ssh/commands.test.ts`: assert remote scripts are fixed command templates with JSON encoded inputs and stdin for replacement content.
- Modify `src/system/ssh/git.ts`: expose remote helper functions that call the new command kinds and parse JSON results.
- Modify `src/system/ssh/git.test.ts`: cover remote helper command inputs, parsing, and failure mapping.
- Modify `src/server/modules/repo-read-paths.ts`: dispatch text file reads to local or remote helper.
- Modify `src/server/modules/repo-write-paths.ts`: dispatch empty-file creation and text replacement, and publish invalidation after successful writes.
- Modify `src/server/modules/repo.test.ts`: cover local/remote dispatch and invalidation behavior.
- Modify `src/server/routes/repo.ts`: add three routes under `/api/repo/file-tree/*`.
- Modify `src/server/routes/repo.test.ts`: cover route parsing for new create/read/replace routes.
- Modify `src/web/repo-client.ts`: add three client methods.
- Modify `src/web/components/file-tree/ProjectFileTree.tsx`: add new-file UI, text content shortcuts, toasts, and replace undo.
- Modify `src/web/components/file-tree/ProjectFileTree.test.tsx`: cover toolbar/context new-file creation, shortcut behavior, and undo.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`: add user-visible labels and errors.
- Run focused tests and typecheck. Run full test suite if remote command or shared types cause broad breakage.

## Task 1: Shared Types And Local Text File Helpers

**Files:**
- Modify: `src/shared/file-tree.ts`
- Modify: `src/system/file-tree/local.test.ts`
- Modify: `src/system/file-tree/local.ts`

- [ ] **Step 1: Add failing local tests**

In `src/system/file-tree/local.test.ts`, extend the import block:

```ts
import {
  createLocalFileTreeDirectory,
  createLocalFileTreeFile,
  deleteLocalFileTreeEntries,
  listLocalFileTreeDirectory,
  moveLocalFileTreeEntries,
  pathInsideRoot,
  readLocalFileTreeTextFile,
  renameLocalFileTreeEntry,
  replaceLocalFileTreeTextFile,
} from '#/system/file-tree/local.ts'
import { FILE_TREE_TEXT_FILE_MAX_BYTES } from '#/shared/file-tree.ts'
```

Append these tests after the existing `createLocalFileTreeDirectory` describe block:

```ts
describe('createLocalFileTreeFile', () => {
  test('creates one empty file inside an existing worktree directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-file-'))
    const srcPath = join(root, 'src')
    await mkdir(srcPath)

    const result = await createLocalFileTreeFile(root, srcPath, 'index.ts')

    expect(result).toEqual({ ok: true, message: '' })
    await expect(readFile(join(srcPath, 'index.ts'), 'utf8')).resolves.toBe('')
  })

  test('rejects unsafe file basenames and destination overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-file-'))
    await writeFile(join(root, 'existing.txt'), 'old')

    await expect(createLocalFileTreeFile(root, root, '../escape.txt')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createLocalFileTreeFile(root, root, 'nested/file.txt')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createLocalFileTreeFile(root, root, 'existing.txt')).resolves.toEqual({
      ok: false,
      message: 'error.file-exists',
    })
  })
})

describe('readLocalFileTreeTextFile', () => {
  test('reads a regular UTF-8 text file inside the worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-read-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'hello\n')

    await expect(readLocalFileTreeTextFile(root, filePath)).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
  })

  test('rejects directories, symlinks, binary content, invalid UTF-8, and oversized files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-read-text-'))
    const dirPath = join(root, 'src')
    const targetPath = join(root, 'target.txt')
    const linkPath = join(root, 'link.txt')
    const binaryPath = join(root, 'binary.dat')
    const invalidUtf8Path = join(root, 'invalid.txt')
    const largePath = join(root, 'large.txt')
    await mkdir(dirPath)
    await writeFile(targetPath, 'target')
    await symlink(targetPath, linkPath)
    await writeFile(binaryPath, Buffer.from([65, 0, 66]))
    await writeFile(invalidUtf8Path, Buffer.from([0xff, 0xfe]))
    await writeFile(largePath, 'a'.repeat(FILE_TREE_TEXT_FILE_MAX_BYTES + 1))

    await expect(readLocalFileTreeTextFile(root, dirPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-not-regular-file',
    })
    await expect(readLocalFileTreeTextFile(root, linkPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-not-regular-file',
    })
    await expect(readLocalFileTreeTextFile(root, binaryPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readLocalFileTreeTextFile(root, invalidUtf8Path)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readLocalFileTreeTextFile(root, largePath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-text-file-too-large',
    })
  })
})

describe('replaceLocalFileTreeTextFile', () => {
  test('replaces a regular UTF-8 text file and returns the previous content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-replace-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'old\n')

    const result = await replaceLocalFileTreeTextFile(root, filePath, 'new\n')

    expect(result).toEqual({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('new\n')
  })

  test('rejects oversized or NUL-containing replacement content without writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-replace-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'old')

    await expect(replaceLocalFileTreeTextFile(root, filePath, 'a'.repeat(FILE_TREE_TEXT_FILE_MAX_BYTES + 1))).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-text-file-too-large',
    })
    await expect(replaceLocalFileTreeTextFile(root, filePath, 'a\0b')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('old')
  })
})
```

- [ ] **Step 2: Run the local tests and verify they fail**

Run:

```bash
bun run test src/system/file-tree/local.test.ts
```

Expected: FAIL because `createLocalFileTreeFile`, `readLocalFileTreeTextFile`, `replaceLocalFileTreeTextFile`, and `FILE_TREE_TEXT_FILE_MAX_BYTES` do not exist.

- [ ] **Step 3: Add shared text file types and guards**

In `src/shared/file-tree.ts`, add the constant after `FILE_TRANSFER_MAX_TOTAL_BYTES`:

```ts
export const FILE_TREE_TEXT_FILE_MAX_BYTES = 1 * 1024 * 1024
```

Add these interfaces after `RepoFileMoveRequest`:

```ts
export interface RepoFileTreeCreateFileRequest {
  repoId: string
  worktreePath: string
  parentDirPath: string
  name: string
}

export type RepoFileTreeTextFileReadResult =
  | {
      ok: true
      content: string
      byteLength: number
    }
  | {
      ok: false
      message: string
    }

export interface RepoFileTreeTextFileReadRequest {
  repoId: string
  worktreePath: string
  filePath: string
}

export type RepoFileTreeTextFileReplaceResult =
  | {
      ok: true
      previousContent: string
      previousByteLength: number
    }
  | {
      ok: false
      message: string
    }

export interface RepoFileTreeTextFileReplaceRequest {
  repoId: string
  worktreePath: string
  filePath: string
  content: string
}
```

Add these guards near `isRepoFileMoveRequest`:

```ts
export function isRepoFileTreeCreateFileRequest(value: unknown): value is RepoFileTreeCreateFileRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.parentDirPath === 'string' &&
    typeof value.name === 'string'
  )
}

export function isRepoFileTreeTextFileReadRequest(value: unknown): value is RepoFileTreeTextFileReadRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.filePath === 'string'
  )
}

export function isRepoFileTreeTextFileReplaceRequest(value: unknown): value is RepoFileTreeTextFileReplaceRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.filePath === 'string' &&
    typeof value.content === 'string'
  )
}
```

- [ ] **Step 4: Implement local helpers**

In `src/system/file-tree/local.ts`, add this import:

```ts
import { TextDecoder } from 'node:util'
```

Extend the existing shared import:

```ts
import {
  FILE_TREE_MAX_ENTRIES,
  FILE_TREE_TEXT_FILE_MAX_BYTES,
  type RepoFileTreeEntry,
  type RepoFileTreeResult,
  type RepoFileTreeTextFileReadResult,
  type RepoFileTreeTextFileReplaceResult,
} from '#/shared/file-tree.ts'
```

Add these helpers after `isDirectoryStat`:

```ts
const STRICT_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

function isFileStat(value: unknown): value is { isFile(): boolean; size: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isFile' in value &&
    typeof value.isFile === 'function' &&
    'size' in value &&
    typeof value.size === 'number'
  )
}

function decodeUtf8Text(bytes: Buffer): { ok: true; content: string } | { ok: false; message: string } {
  try {
    const content = STRICT_UTF8_DECODER.decode(bytes)
    if (content.includes('\0')) return { ok: false, message: 'error.file-tree-binary-file' }
    return { ok: true, content }
  } catch {
    return { ok: false, message: 'error.file-tree-binary-file' }
  }
}

function validateReplacementText(content: string): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  if (content.includes('\0')) return { ok: false, message: 'error.file-tree-binary-file' }
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.byteLength > FILE_TREE_TEXT_FILE_MAX_BYTES) {
    return { ok: false, message: 'error.file-tree-text-file-too-large' }
  }
  return { ok: true, bytes }
}

async function readRegularTextFile(root: string, filePath: string): Promise<RepoFileTreeTextFileReadResult> {
  const file = path.resolve(filePath)
  if (!pathInsideRoot(root, file)) return { ok: false, message: 'error.invalid-path' }
  const stat = await fs.lstat(file).catch((err: unknown) => err)
  if (!isFileStat(stat)) return { ok: false, message: classifyFsWriteError(stat) }
  if (!stat.isFile()) return { ok: false, message: 'error.file-tree-not-regular-file' }
  if (stat.size > FILE_TREE_TEXT_FILE_MAX_BYTES) return { ok: false, message: 'error.file-tree-text-file-too-large' }
  try {
    const bytes = await fs.readFile(file)
    const decoded = decodeUtf8Text(bytes)
    if (!decoded.ok) return decoded
    return { ok: true, content: decoded.content, byteLength: bytes.byteLength }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}
```

Add these exported functions after `createLocalFileTreeDirectory`:

```ts
export async function createLocalFileTreeFile(
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(parentDirPath) || !isValidFileTreeBasename(name)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const parentDir = path.resolve(parentDirPath)
  if (!pathInsideRoot(root, parentDir)) return { ok: false, message: 'error.invalid-path' }
  const parentStat = await fs.stat(parentDir).catch((err: unknown) => err)
  if (!isDirectoryStat(parentStat)) return { ok: false, message: classifyFsWriteError(parentStat) }
  if (!parentStat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }

  const target = path.join(parentDir, name)
  if (!pathInsideRoot(root, target)) return { ok: false, message: 'error.invalid-path' }
  try {
    const handle = await fs.open(target, 'wx')
    await handle.close()
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function readLocalFileTreeTextFile(
  worktreePath: string,
  filePath: string,
): Promise<RepoFileTreeTextFileReadResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await readRegularTextFile(path.resolve(worktreePath), filePath)
}

export async function replaceLocalFileTreeTextFile(
  worktreePath: string,
  filePath: string,
  content: string,
): Promise<RepoFileTreeTextFileReplaceResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath) || typeof content !== 'string') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const replacement = validateReplacementText(content)
  if (!replacement.ok) return replacement
  const root = path.resolve(worktreePath)
  const previous = await readRegularTextFile(root, filePath)
  if (!previous.ok) return previous
  try {
    await fs.writeFile(path.resolve(filePath), replacement.bytes)
    return { ok: true, previousContent: previous.content, previousByteLength: previous.byteLength }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}
```

- [ ] **Step 5: Run local tests and typecheck for this layer**

Run:

```bash
bun run test src/system/file-tree/local.test.ts
bun run typecheck
```

Expected: local tests PASS. Typecheck may still fail until later tasks add remote/server call sites if imports have not been wired yet; if it fails only on symbols planned below, continue.

## Task 2: Remote Command Templates

**Files:**
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/commands.ts`

- [ ] **Step 1: Add failing remote command script tests**

In `src/system/ssh/commands.test.ts`, add these tests after the existing create-directory command test:

```ts
  test('builds a fixed remote create file command with JSON encoded inputs', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'createFileTreeFile',
      worktreePath: '/srv/repo',
      parentDirPath: "/srv/repo/src with 'quote'",
      name: 'index.ts',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('open(target, "xb")')
    expect(invocation.script).toContain('src with')
    expect(invocation.script).toContain('index.ts')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote text file read command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'readFileTreeTextFile',
      worktreePath: '/srv/repo',
      filePath: "/srv/repo/README 'quoted'.md",
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('read_text_file')
    expect(invocation.script).toContain('FILE_TREE_TEXT_FILE_MAX_BYTES')
    expect(invocation.script).toContain("README 'quoted'.md")
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote text file replace command that reads content from stdin', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'replaceFileTreeTextFile',
      worktreePath: '/srv/repo',
      filePath: '/srv/repo/README.md',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('sys.stdin.buffer.read')
    expect(invocation.script).toContain('base64.b64decode')
    expect(invocation.script).toContain('/srv/repo/README.md')
    expect(invocation.args).toContain(TARGET.alias)
  })
```

- [ ] **Step 2: Run command tests and verify they fail**

Run:

```bash
bun run test src/system/ssh/commands.test.ts
```

Expected: FAIL because the new remote command kinds are not part of `RemoteCommandKind`.

- [ ] **Step 3: Add command kinds and route them to scripts**

In `src/system/ssh/commands.ts`, extend the shared import:

```ts
import {
  FILE_TRANSFER_MAX_FILE_BYTES,
  FILE_TRANSFER_MAX_TOTAL_BYTES,
  FILE_TREE_MAX_ENTRIES,
  FILE_TREE_TEXT_FILE_MAX_BYTES,
} from '#/shared/file-tree.ts'
```

Add these variants to `RemoteCommandKind` near the other file-tree variants:

```ts
  | { type: 'createFileTreeFile'; worktreePath: string; parentDirPath: string; name: string }
  | { type: 'readFileTreeTextFile'; worktreePath: string; filePath: string }
  | { type: 'replaceFileTreeTextFile'; worktreePath: string; filePath: string }
```

Add these cases in `scriptForCommand` after `createFileTreeDirectory`:

```ts
    case 'createFileTreeFile':
      return remoteCreateFileTreeFileScript(command)
    case 'readFileTreeTextFile':
      return remoteReadFileTreeTextFileScript(command)
    case 'replaceFileTreeTextFile':
      return remoteReplaceFileTreeTextFileScript(command)
```

- [ ] **Step 4: Add the Python script builders**

In `src/system/ssh/commands.ts`, add these functions after `remoteCreateFileTreeDirectoryScript`:

```ts
function remoteCreateFileTreeFileScript(command: Extract<RemoteCommandKind, { type: 'createFileTreeFile' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteFileTreePreamble(command.worktreePath),
    `parent_dir = ${pythonString(command.parentDirPath)}`,
    `name = ${pythonString(command.name)}`,
    'if not isinstance(parent_dir, str) or not parent_dir or "\\x00" in parent_dir:',
    '    finish(False, "error.invalid-arguments")',
    'parent_dir = os.path.normpath(parent_dir)',
    'if not os.path.isabs(parent_dir):',
    '    finish(False, "error.invalid-arguments")',
    'if not inside_root(parent_dir):',
    '    finish(False, "error.invalid-path")',
    'if not os.path.isdir(parent_dir):',
    '    finish(False, "error.path-not-directory")',
    'if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\\x00" in name:',
    '    finish(False, "error.invalid-arguments")',
    'target = os.path.normpath(os.path.join(parent_dir, name))',
    'if not inside_root(target):',
    '    finish(False, "error.invalid-path")',
    'try:',
    '    handle = open(target, "xb")',
    '    handle.close()',
    '    finish(True)',
    'except FileExistsError:',
    '    finish(False, "error.file-exists")',
    'except FileNotFoundError:',
    '    finish(False, "error.path-not-found")',
    'except PermissionError:',
    '    finish(False, "error.path-permission-denied")',
    'except OSError:',
    '    finish(False, "error.failed-read-repo")',
    'PY',
  ].join('\n')
}

function remoteTextFilePreamble(worktreePath: string): string[] {
  return [
    '# FILE_TREE_TEXT_FILE_MAX_BYTES',
    'import base64, json, os, stat, sys',
    `root = ${pythonString(worktreePath)}`,
    `max_bytes = ${FILE_TREE_TEXT_FILE_MAX_BYTES}`,
    'root_real = os.path.normpath(root)',
    'def finish(payload):',
    '    print(json.dumps(payload, ensure_ascii=False))',
    '    sys.exit(0)',
    'def fail(message):',
    '    finish({"ok": False, "message": message})',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def checked_file_path(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        fail("error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        fail("error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        fail("error.invalid-path")',
    '    return candidate',
    'def decode_text(raw):',
    '    if len(raw) > max_bytes:',
    '        fail("error.file-tree-text-file-too-large")',
    '    try:',
    '        content = raw.decode("utf-8", "strict")',
    '    except UnicodeDecodeError:',
    '        fail("error.file-tree-binary-file")',
    '    if "\\x00" in content:',
    '        fail("error.file-tree-binary-file")',
    '    return content',
    'def read_text_file(path_value):',
    '    try:',
    '        info = os.lstat(path_value)',
    '    except FileNotFoundError:',
    '        fail("error.path-not-found")',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    if not stat.S_ISREG(info.st_mode):',
    '        fail("error.file-tree-not-regular-file")',
    '    if info.st_size > max_bytes:',
    '        fail("error.file-tree-text-file-too-large")',
    '    try:',
    '        with open(path_value, "rb") as handle:',
    '            raw = handle.read(max_bytes + 1)',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    except OSError:',
    '        fail("error.failed-read-repo")',
    '    content = decode_text(raw)',
    '    return content, len(raw)',
  ]
}

function remoteReadFileTreeTextFileScript(command: Extract<RemoteCommandKind, { type: 'readFileTreeTextFile' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteTextFilePreamble(command.worktreePath),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'content, byte_length = read_text_file(file_path)',
    'finish({"ok": True, "content": content, "byteLength": byte_length})',
    'PY',
  ].join('\n')
}

function remoteReplaceFileTreeTextFileScript(command: Extract<RemoteCommandKind, { type: 'replaceFileTreeTextFile' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteTextFilePreamble(command.worktreePath),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'stdin_raw = sys.stdin.buffer.read()',
    'try:',
    '    next_raw = base64.b64decode(stdin_raw, validate=True)',
    'except Exception:',
    '    fail("error.invalid-arguments")',
    'next_content = decode_text(next_raw)',
    'previous_content, previous_byte_length = read_text_file(file_path)',
    'try:',
    '    with open(file_path, "wb") as handle:',
    '        handle.write(next_raw)',
    'except PermissionError:',
    '    fail("error.path-permission-denied")',
    'except OSError:',
    '    fail("error.failed-read-repo")',
    'finish({"ok": True, "previousContent": previous_content, "previousByteLength": previous_byte_length})',
    'PY',
  ].join('\n')
}
```

- [ ] **Step 5: Run command tests**

Run:

```bash
bun run test src/system/ssh/commands.test.ts
```

Expected: PASS.

## Task 3: Remote Git Text File Helpers

**Files:**
- Modify: `src/system/ssh/git.test.ts`
- Modify: `src/system/ssh/git.ts`

- [ ] **Step 1: Add failing remote helper tests**

In `src/system/ssh/git.test.ts`, extend the import block:

```ts
  createRemoteFileTreeFile,
  readRemoteFileTreeTextFile,
  replaceRemoteFileTreeTextFile,
```

Add these tests after the create-directory helper test:

```ts
  test('createRemoteFileTreeFile returns parsed success and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await createRemoteFileTreeFile(TARGET, '/srv/repo', '/srv/repo/src', 'index.ts', {
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'createFileTreeFile',
        worktreePath: '/srv/repo',
        parentDirPath: '/srv/repo/src',
        name: 'index.ts',
      },
      TARGET,
      { signal: undefined },
    )
  })

  test('readRemoteFileTreeTextFile parses remote JSON text content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({ ok: true, content: 'hello\n', byteLength: 6 }),
      stderr: '',
    }))

    await expect(readRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo/README.md', { run: run as any })).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'readFileTreeTextFile', worktreePath: '/srv/repo', filePath: '/srv/repo/README.md' },
      TARGET,
      { signal: undefined, timeoutMs: 90_000, maxBuffer: expect.any(Number) },
    )
  })

  test('replaceRemoteFileTreeTextFile sends replacement content through stdin and returns previous content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({ ok: true, previousContent: 'old\n', previousByteLength: 4 }),
      stderr: '',
    }))

    await expect(
      replaceRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo/README.md', 'new\n', { run: run as any }),
    ).resolves.toEqual({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'replaceFileTreeTextFile', worktreePath: '/srv/repo', filePath: '/srv/repo/README.md' },
      TARGET,
      {
        signal: undefined,
        timeoutMs: 90_000,
        stdin: Buffer.from('new\n', 'utf8').toString('base64'),
        maxBuffer: expect.any(Number),
      },
    )
  })
```

- [ ] **Step 2: Run remote helper tests and verify they fail**

Run:

```bash
bun run test src/system/ssh/git.test.ts
```

Expected: FAIL because the new helper exports do not exist.

- [ ] **Step 3: Implement remote helper exports**

In `src/system/ssh/git.ts`, extend the shared import:

```ts
import type {
  RepoFileSearchResult,
  RepoFileTreeResult,
  RepoFileTreeTextFileReadResult,
  RepoFileTreeTextFileReplaceResult,
} from '#/shared/file-tree.ts'
```

Add these helpers near the existing remote file-tree mutation helpers:

```ts
export async function createRemoteFileTreeFile(
  target: RemoteRepoTarget,
  worktreePath: string,
  parentDirPath: string,
  name: string,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<ExecResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'createFileTreeFile', worktreePath, parentDirPath, name },
    target,
    { signal: options.signal },
  )
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  return remoteFileTreeMutationResult(result)
}

export async function readRemoteFileTreeTextFile(
  target: RemoteRepoTarget,
  worktreePath: string,
  filePath: string,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<RepoFileTreeTextFileReadResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'readFileTreeTextFile', worktreePath, filePath },
    target,
    { signal: options.signal, timeoutMs: REMOTE_FILE_TRANSFER_TIMEOUT_MS, maxBuffer: REMOTE_FILE_TRANSFER_MAX_BUFFER },
  )
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!result.ok && !result.stdout) return { ok: false, message: remoteExecResult(result).message }
  return parseRemoteTextFileReadResult(result.stdout)
}

export async function replaceRemoteFileTreeTextFile(
  target: RemoteRepoTarget,
  worktreePath: string,
  filePath: string,
  content: string,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<RepoFileTreeTextFileReplaceResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'replaceFileTreeTextFile', worktreePath, filePath },
    target,
    {
      signal: options.signal,
      timeoutMs: REMOTE_FILE_TRANSFER_TIMEOUT_MS,
      stdin: Buffer.from(content, 'utf8').toString('base64'),
      maxBuffer: REMOTE_FILE_TRANSFER_MAX_BUFFER,
    },
  )
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!result.ok && !result.stdout) return { ok: false, message: remoteExecResult(result).message }
  return parseRemoteTextFileReplaceResult(result.stdout)
}
```

Add these parsers near `remoteFileTreeMutationResult`:

```ts
function parseRemoteTextFileReadResult(value: string): RepoFileTreeTextFileReadResult {
  try {
    const parsed = JSON.parse(value) as Partial<RepoFileTreeTextFileReadResult>
    if (parsed.ok === true && typeof parsed.content === 'string' && typeof parsed.byteLength === 'number') {
      return { ok: true, content: parsed.content, byteLength: parsed.byteLength }
    }
    if (parsed.ok === false && typeof parsed.message === 'string') return { ok: false, message: parsed.message }
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  return { ok: false, message: 'error.failed-read-repo' }
}

function parseRemoteTextFileReplaceResult(value: string): RepoFileTreeTextFileReplaceResult {
  try {
    const parsed = JSON.parse(value) as Partial<RepoFileTreeTextFileReplaceResult>
    if (
      parsed.ok === true &&
      typeof parsed.previousContent === 'string' &&
      typeof parsed.previousByteLength === 'number'
    ) {
      return {
        ok: true,
        previousContent: parsed.previousContent,
        previousByteLength: parsed.previousByteLength,
      }
    }
    if (parsed.ok === false && typeof parsed.message === 'string') return { ok: false, message: parsed.message }
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  return { ok: false, message: 'error.failed-read-repo' }
}
```

- [ ] **Step 4: Run SSH tests**

Run:

```bash
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: PASS.

## Task 4: Server Modules, Routes, And Web Client

**Files:**
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/web/repo-client.ts`

- [ ] **Step 1: Extend server module mocks and failing tests**

In `src/server/modules/repo.test.ts`, add these mock functions to the hoisted `mocks` object:

```ts
  createLocalFileTreeFile: vi.fn(),
  createRemoteFileTreeFile: vi.fn(),
  readLocalFileTreeTextFile: vi.fn(),
  readRemoteFileTreeTextFile: vi.fn(),
  replaceLocalFileTreeTextFile: vi.fn(),
  replaceRemoteFileTreeTextFile: vi.fn(),
```

Extend the `#/system/file-tree/local.ts` mock:

```ts
  createLocalFileTreeFile: mocks.createLocalFileTreeFile,
  readLocalFileTreeTextFile: mocks.readLocalFileTreeTextFile,
  replaceLocalFileTreeTextFile: mocks.replaceLocalFileTreeTextFile,
```

Extend the `#/system/ssh/git.ts` mock:

```ts
  createRemoteFileTreeFile: mocks.createRemoteFileTreeFile,
  readRemoteFileTreeTextFile: mocks.readRemoteFileTreeTextFile,
  replaceRemoteFileTreeTextFile: mocks.replaceRemoteFileTreeTextFile,
```

In the `beforeEach`, set default results:

```ts
  mocks.createLocalFileTreeFile.mockResolvedValue({ ok: true, message: '' })
  mocks.createRemoteFileTreeFile.mockResolvedValue({ ok: true, message: '' })
  mocks.readLocalFileTreeTextFile.mockResolvedValue({ ok: true, content: 'hello\n', byteLength: 6 })
  mocks.readRemoteFileTreeTextFile.mockResolvedValue({ ok: true, content: 'remote\n', byteLength: 7 })
  mocks.replaceLocalFileTreeTextFile.mockResolvedValue({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
  mocks.replaceRemoteFileTreeTextFile.mockResolvedValue({ ok: true, previousContent: 'remote old\n', previousByteLength: 11 })
```

Append tests near the existing file-tree module tests:

```ts
  test('createRepositoryFileTreeFile publishes snapshot invalidation after local success', async () => {
    const { createRepositoryFileTreeFile } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryFileTreeFile('/tmp/repo', '/tmp/repo', '/tmp/repo/src', 'index.ts')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.createLocalFileTreeFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/src', 'index.ts')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('readRepositoryFileTreeTextFile dispatches local and remote repos', async () => {
    const { readRepositoryFileTreeTextFile } = await import('#/server/modules/repo-read-paths.ts')

    await expect(readRepositoryFileTreeTextFile('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md')).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
    await expect(
      readRepositoryFileTreeTextFile('ssh-config://prod/srv/repo', '/srv/repo', '/srv/repo/README.md'),
    ).resolves.toEqual({
      ok: true,
      content: 'remote\n',
      byteLength: 7,
    })
    expect(mocks.readLocalFileTreeTextFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md')
    expect(mocks.readRemoteFileTreeTextFile).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/README.md',
      { signal: undefined },
    )
  })

  test('replaceRepositoryFileTreeTextFile publishes snapshot invalidation after local success', async () => {
    const { replaceRepositoryFileTreeTextFile } = await import('#/server/modules/repo-write-paths.ts')

    const result = await replaceRepositoryFileTreeTextFile('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'new\n')

    expect(result).toEqual({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
    expect(mocks.replaceLocalFileTreeTextFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md', 'new\n')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })
```

- [ ] **Step 2: Run server module tests and verify they fail**

Run:

```bash
bun run test src/server/modules/repo.test.ts
```

Expected: FAIL because module exports do not exist.

- [ ] **Step 3: Implement module dispatch**

In `src/server/modules/repo-read-paths.ts`, extend imports:

```ts
import { readLocalFileTreeTextFile } from '#/system/file-tree/local.ts'
import { readRemoteFileTreeTextFile } from '#/system/ssh/git.ts'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import type { RepoFileTreeTextFileReadResult } from '#/shared/file-tree.ts'
```

Add:

```ts
export async function readRepositoryFileTreeTextFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<RepoFileTreeTextFileReadResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (isRemoteRepoId(repoId)) {
    return await readRemoteFileTreeTextFile(await resolveRemoteRepoTarget(repoId), worktreePath, filePath, { signal })
  }
  return await readLocalFileTreeTextFile(worktreePath, filePath)
}
```

In `src/server/modules/repo-write-paths.ts`, extend imports from local and remote helpers:

```ts
  createLocalFileTreeFile,
  replaceLocalFileTreeTextFile,
```

```ts
  createRemoteFileTreeFile,
  replaceRemoteFileTreeTextFile,
```

Extend shared type import:

```ts
import { type ExecResult } from '#/shared/git-types.ts'
import type { RepoFileTreeTextFileReplaceResult } from '#/shared/file-tree.ts'
```

Add after `createRepositoryFileTreeDirectory`:

```ts
export async function createRepositoryFileTreeFile(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const result = isRemoteRepoId(repoId)
    ? await createRemoteFileTreeFile(await resolveRemoteRepoTarget(repoId), worktreePath, parentDirPath, name, { signal })
    : await createLocalFileTreeFile(worktreePath, parentDirPath, name)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function replaceRepositoryFileTreeTextFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  content: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepoFileTreeTextFileReplaceResult> {
  const result = isRemoteRepoId(repoId)
    ? await replaceRemoteFileTreeTextFile(await resolveRemoteRepoTarget(repoId), worktreePath, filePath, content, { signal })
    : await replaceLocalFileTreeTextFile(worktreePath, filePath, content)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}
```

- [ ] **Step 4: Add failing route tests**

In `src/server/routes/repo.test.ts`, extend `mocks`:

```ts
  createRepositoryFileTreeFile: vi.fn(),
  readRepositoryFileTreeTextFile: vi.fn(),
  replaceRepositoryFileTreeTextFile: vi.fn(),
```

Extend the read-paths mock:

```ts
  readRepositoryFileTreeTextFile: mocks.readRepositoryFileTreeTextFile,
```

Extend the write-paths mock:

```ts
  createRepositoryFileTreeFile: mocks.createRepositoryFileTreeFile,
  replaceRepositoryFileTreeTextFile: mocks.replaceRepositoryFileTreeTextFile,
```

Set defaults in `beforeEach`:

```ts
    mocks.createRepositoryFileTreeFile.mockResolvedValue({ ok: true, message: '' })
    mocks.readRepositoryFileTreeTextFile.mockResolvedValue({ ok: true, content: 'hello\n', byteLength: 6 })
    mocks.replaceRepositoryFileTreeTextFile.mockResolvedValue({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
```

Append route tests:

```ts
  test('routes file tree create file with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/create-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', parentDirPath: '/repo/src', name: 'index.ts' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '' })
    expect(mocks.createRepositoryFileTreeFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/src',
      'index.ts',
      expect.any(AbortSignal),
      undefined,
    )
  })

  test('routes file tree text file read with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/read-text-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/README.md' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, content: 'hello\n', byteLength: 6 })
    expect(mocks.readRepositoryFileTreeTextFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/README.md',
      expect.any(AbortSignal),
    )
  })

  test('routes file tree text file replace with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/replace-text-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/README.md', content: 'new\n' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
    expect(mocks.replaceRepositoryFileTreeTextFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/README.md',
      'new\n',
      expect.any(AbortSignal),
      undefined,
    )
  })
```

- [ ] **Step 5: Implement routes**

In `src/server/routes/repo.ts`, import new module functions:

```ts
  readRepositoryFileTreeTextFile,
```

```ts
  createRepositoryFileTreeFile,
  replaceRepositoryFileTreeTextFile,
```

Add route handlers after `/file-tree/create-directory`:

```ts
  app.post('/file-tree/create-file', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    const parentDirPath = typeof body?.parentDirPath === 'string' ? body.parentDirPath : ''
    const name = typeof body?.name === 'string' ? body.name : ''
    const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
    return c.json(
      await jsonOr(
        () => createRepositoryFileTreeFile(repoId, worktreePath, parentDirPath, name, c.req.raw.signal, sourceToken),
        { ok: false, message: 'error.failed-read-repo' },
        'file-tree-create-file',
      ),
    )
  })
  app.post('/file-tree/read-text-file', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    const filePath = typeof body?.filePath === 'string' ? body.filePath : ''
    return c.json(
      await jsonOr(
        () => readRepositoryFileTreeTextFile(repoId, worktreePath, filePath, c.req.raw.signal),
        { ok: false, message: 'error.failed-read-repo' },
        'file-tree-read-text-file',
      ),
    )
  })
  app.post('/file-tree/replace-text-file', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    const filePath = typeof body?.filePath === 'string' ? body.filePath : ''
    const content = typeof body?.content === 'string' ? body.content : ''
    const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
    return c.json(
      await jsonOr(
        () => replaceRepositoryFileTreeTextFile(repoId, worktreePath, filePath, content, c.req.raw.signal, sourceToken),
        { ok: false, message: 'error.failed-read-repo' },
        'file-tree-replace-text-file',
      ),
    )
  })
```

- [ ] **Step 6: Add web client methods**

In `src/web/repo-client.ts`, extend shared file-tree type imports:

```ts
  RepoFileTreeTextFileReadResult,
  RepoFileTreeTextFileReplaceResult,
```

Add after `createRepositoryFileTreeDirectory`:

```ts
export async function createRepositoryFileTreeFile(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/create-file', { repoId, worktreePath, parentDirPath, name })
}

export async function readRepositoryFileTreeTextFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
): Promise<RepoFileTreeTextFileReadResult> {
  return await postServerJson('/api/repo/file-tree/read-text-file', { repoId, worktreePath, filePath })
}

export async function replaceRepositoryFileTreeTextFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  content: string,
): Promise<RepoFileTreeTextFileReplaceResult> {
  return await postServerJson('/api/repo/file-tree/replace-text-file', { repoId, worktreePath, filePath, content })
}
```

- [ ] **Step 7: Run server/client tests**

Run:

```bash
bun run test src/server/modules/repo.test.ts src/server/routes/repo.test.ts
bun run typecheck
```

Expected: tests PASS. Typecheck may still fail if renderer tests have not been updated to mock new repo-client exports; continue to the renderer tasks.

## Task 5: File Tree New File UI

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`

- [ ] **Step 1: Add failing renderer tests for new-file entry points**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, add a mock:

```ts
const createRepositoryFileTreeFile = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, message: '' }))
```

Extend the `#/web/repo-client.ts` mock:

```ts
  createRepositoryFileTreeFile: (...args: unknown[]) => createRepositoryFileTreeFile(...args),
```

Clear it in `beforeEach`:

```ts
  createRepositoryFileTreeFile.mockClear()
```

Add these tests near the existing folder creation test:

```ts
  test('creates a file from the file tree toolbar in the worktree root', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const newFileButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.new-file"]')
    if (!newFileButton) throw new Error('missing new file button')

    await act(async () => {
      newFileButton.click()
      await Promise.resolve()
    })

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.new-file-input-label"]')
    if (!input) throw new Error('missing new file input')

    await act(async () => {
      input.value = 'notes.md'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createRepositoryFileTreeFile).toHaveBeenCalledWith('/repo', '/repo', '/repo', 'notes.md')
    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo', undefined)
  })

  test('creates a file from a directory context menu and refreshes that directory', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    await clickContextMenuItem(treeItemByText('src'), 'file-tree.new-file')

    const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.new-file-input-label"]')
    if (!input) throw new Error('missing new file input')

    await act(async () => {
      input.value = 'index.ts'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createRepositoryFileTreeFile).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', 'index.ts')
    expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
  })
```

Update existing context-menu label assertions:

```ts
expect(labels).toContain('file-tree.new-file')
expect(labels).toContain('file-tree.new-folder')
```

- [ ] **Step 2: Run file-tree tests and verify they fail**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: FAIL because no new-file UI or repo-client call exists.

- [ ] **Step 3: Generalize create-entry state**

In `src/web/components/file-tree/ProjectFileTree.tsx`, extend imports:

```ts
  FilePlus,
```

Extend the repo-client import:

```ts
  createRepositoryFileTreeFile,
```

Replace `CreateDirectoryTarget` with:

```ts
type CreateEntryKind = 'file' | 'directory'

interface CreateEntryTarget {
  parentRelativePath: string
  parentAbsolutePath: string
}
```

Replace the `createDirectory*` state fields with:

```ts
  const [createEntryTarget, setCreateEntryTarget] = useState<CreateEntryTarget | null>(null)
  const [createEntryKind, setCreateEntryKind] = useState<CreateEntryKind>('directory')
  const [createEntryName, setCreateEntryName] = useState('')
  const [createEntryPending, setCreateEntryPending] = useState(false)
  const [createEntryError, setCreateEntryError] = useState<string | null>(null)
```

Rename and adjust the helpers:

```ts
  const rootCreateEntryTarget = useCallback((): CreateEntryTarget | null => {
    if (!worktreePath) return null
    return { parentRelativePath: ROOT_DIR, parentAbsolutePath: worktreePath }
  }, [worktreePath])

  const createEntryTargetForNode = useCallback(
    (node: FileTreeNode | null): CreateEntryTarget | null => {
      if (!worktreePath || !node) return rootCreateEntryTarget()
      if (isExpandableNode(node)) {
        return { parentRelativePath: node.relativePath, parentAbsolutePath: node.absolutePath }
      }
      return {
        parentRelativePath: parentRelativePathForNode(node),
        parentAbsolutePath: parentAbsolutePathForNode(worktreePath, node),
      }
    },
    [rootCreateEntryTarget, worktreePath],
  )

  const beginCreateEntry = useCallback(
    (kind: CreateEntryKind, target: CreateEntryTarget | null) => {
      if (!target) return
      setCreateEntryKind(kind)
      setCreateEntryTarget(target)
      setCreateEntryName('')
      setCreateEntryError(null)
      setContextOpen(false)
      if (target.parentRelativePath) {
        setExpandedDirs((current) => new Set(current).add(target.parentRelativePath))
      }
      const state = directoriesRef.current[target.parentRelativePath]
      if (!state?.entries && !state?.loading) {
        void loadDirectory(target.parentRelativePath, target.parentAbsolutePath)
      }
    },
    [loadDirectory],
  )

  const beginCreateEntryForNode = useCallback(
    (kind: CreateEntryKind, node: FileTreeNode | null) => {
      beginCreateEntry(kind, createEntryTargetForNode(node))
    },
    [beginCreateEntry, createEntryTargetForNode],
  )

  const cancelCreateEntry = useCallback(() => {
    if (createEntryPending) return
    setCreateEntryTarget(null)
    setCreateEntryName('')
    setCreateEntryError(null)
  }, [createEntryPending])

  const submitCreateEntry = useCallback(
    async (value = createEntryName) => {
      if (!worktreePath || !createEntryTarget) return
      const name = value.trim()
      if (!name) {
        setCreateEntryError('error.invalid-arguments')
        return
      }
      setCreateEntryPending(true)
      setCreateEntryError(null)
      const result =
        createEntryKind === 'file'
          ? await createRepositoryFileTreeFile(repoId, worktreePath, createEntryTarget.parentAbsolutePath, name)
          : await createRepositoryFileTreeDirectory(repoId, worktreePath, createEntryTarget.parentAbsolutePath, name)
      setCreateEntryPending(false)
      if (!result.ok) {
        setCreateEntryError(result.message)
        return
      }

      const newRelativePath = createEntryTarget.parentRelativePath
        ? `${createEntryTarget.parentRelativePath}/${name}`
        : name
      setCreateEntryTarget(null)
      setCreateEntryName('')
      setCreateEntryError(null)
      await loadDirectory(createEntryTarget.parentRelativePath, createEntryTarget.parentAbsolutePath)
      setSelection({ selected: new Set([newRelativePath]), anchor: newRelativePath })
      setFocusedNodeId(newRelativePath)
    },
    [createEntryKind, createEntryName, createEntryTarget, loadDirectory, repoId, worktreePath],
  )
```

Replace remaining `createDirectoryTarget`, `createDirectoryName`, `createDirectoryPending`, and `createDirectoryError` usages with the new entry state. Keep behavior identical for directory creation.

- [ ] **Step 4: Replace the create row component**

Rename `FileTreeCreateDirectoryRow` to `FileTreeCreateEntryRow` and use an icon/label by kind:

```tsx
function FileTreeCreateEntryRow({
  kind,
  depth,
  value,
  pending,
  error,
  onValueChange,
  onCancel,
  onSubmit,
}: {
  kind: CreateEntryKind
  depth: number
  value: string
  pending: boolean
  error: string | null
  onValueChange: (value: string) => void
  onCancel: () => void
  onSubmit: (value?: string) => void
}) {
  const t = useT()
  const label = kind === 'file' ? t('file-tree.new-file-input-label') : t('file-tree.new-folder-input-label')
  const Icon = kind === 'file' ? File : Folder
  return (
    <>
      <div
        className="flex h-6 min-w-0 cursor-default select-none items-center gap-1 px-2 text-foreground"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span className="flex size-4 shrink-0 items-center justify-center" />
        <Icon className="size-3.5 shrink-0" />
        <Input
          aria-label={label}
          value={value}
          disabled={pending}
          autoFocus
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              void onSubmit(event.currentTarget.value)
            }
          }}
          className="h-5 min-w-0 flex-1 px-1 py-0 text-[length:var(--goblin-file-tree-font-size)]"
        />
      </div>
      {error ? <FileTreeIndentedMessage depth={depth + 1}>{t(error)}</FileTreeIndentedMessage> : null}
    </>
  )
}
```

- [ ] **Step 5: Add toolbar and context menu entry points**

Extend `FileTreeToolbar` props:

```ts
  onCreateFile,
```

```ts
  onCreateFile: () => void
```

Render the new toolbar button before the folder button:

```tsx
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t('file-tree.new-file')}
          title={t('file-tree.new-file')}
          onClick={onCreateFile}
        >
          <FilePlus className="size-3.5" />
        </Button>
```

Pass it from the main render:

```tsx
            onCreateFile={() => beginCreateEntry('file', rootCreateEntryTarget())}
            onCreateDirectory={() => beginCreateEntry('directory', rootCreateEntryTarget())}
```

Extend `FileTreeContextMenu` and `FileTreeEmptyContextMenu` props with `onBeginCreateFile`, then render:

```tsx
      <ContextMenuItem disabled={!realNode} onSelect={() => onBeginCreateFile(node)}>
        <FilePlus className="size-3.5" />
        {t('file-tree.new-file')}
      </ContextMenuItem>
```

For empty-area context menu:

```tsx
      <ContextMenuItem onSelect={onCreateFile}>
        <FilePlus className="size-3.5" />
        {t('file-tree.new-file')}
      </ContextMenuItem>
```

Wire row props:

```tsx
onBeginCreateFile={(node) => beginCreateEntryForNode('file', node)}
onBeginCreateDirectory={(node) => beginCreateEntryForNode('directory', node)}
```

- [ ] **Step 6: Run renderer new-file tests**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: new-file tests PASS and existing folder creation tests still PASS.

## Task 6: File Content Copy, Replace, And Undo

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`

- [ ] **Step 1: Add failing shortcut tests**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, import toast mocks:

```ts
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))
```

Add repo-client mocks:

```ts
const readRepositoryFileTreeTextFile = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  content: 'file contents\n',
  byteLength: 14,
}))
const replaceRepositoryFileTreeTextFile = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  previousContent: 'old contents\n',
  previousByteLength: 13,
}))
```

Extend the repo-client mock:

```ts
  readRepositoryFileTreeTextFile: (...args: unknown[]) => readRepositoryFileTreeTextFile(...args),
  replaceRepositoryFileTreeTextFile: (...args: unknown[]) => replaceRepositoryFileTreeTextFile(...args),
```

Clear defaults in `beforeEach` and give clipboard `readText`:

```ts
  readRepositoryFileTreeTextFile.mockClear()
  replaceRepositoryFileTreeTextFile.mockClear()
  toastMocks.success.mockClear()
  toastMocks.error.mockClear()
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => 'replacement\n'),
    },
  })
```

Add these tests near existing copy/paste keyboard tests:

```ts
  test('copies focused text file contents with primary shift c', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'c', metaKey: true, shiftKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(readRepositoryFileTreeTextFile).toHaveBeenCalledWith('/repo', '/repo', '/repo/README.md')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('file contents\n')
    expect(toastMocks.success).toHaveBeenCalledWith('file-tree.copy-file-contents-ok')
    expect(transferRepositoryFiles).not.toHaveBeenCalled()
  })

  test('replaces focused text file contents with primary shift v and supports undo', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const file = treeItemByText('README.md')
    await act(async () => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v', metaKey: true, shiftKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(navigator.clipboard.readText).toHaveBeenCalled()
    expect(replaceRepositoryFileTreeTextFile).toHaveBeenNthCalledWith(
      1,
      '/repo',
      '/repo',
      '/repo/README.md',
      'replacement\n',
    )
    expect(toastMocks.success).toHaveBeenCalledWith('file-tree.replace-file-contents-ok')

    await act(async () => {
      file.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(replaceRepositoryFileTreeTextFile).toHaveBeenNthCalledWith(
      2,
      '/repo',
      '/repo',
      '/repo/README.md',
      'old contents\n',
    )
  })

  test('does not run content shortcuts for directories or multi-selection', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const directory = treeItemByText('src')
    await act(async () => {
      directory.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      directory.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'c', metaKey: true, shiftKey: true }))
      await Promise.resolve()
    })

    expect(readRepositoryFileTreeTextFile).not.toHaveBeenCalled()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run shortcut tests and verify they fail**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: FAIL because content shortcuts and undo action do not exist.

- [ ] **Step 3: Implement content shortcut helpers**

In `src/web/components/file-tree/ProjectFileTree.tsx`, add:

```ts
import { toast } from 'sonner'
```

Extend repo-client imports:

```ts
  readRepositoryFileTreeTextFile,
  replaceRepositoryFileTreeTextFile,
```

Extend `FileTreeUndoAction`:

```ts
  | {
      kind: 'replaceTextFile'
      path: string
      relativePath: string
      previousContent: string
    }
```

Add helper functions near `isUndoShortcut`:

```ts
function contentClipboardShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): 'copy' | 'paste' | null {
  if (event.altKey || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return null
  const key = event.key.toLowerCase()
  if (key === 'c') return 'copy'
  if (key === 'v') return 'paste'
  return null
}

function isPlainFileNode(node: FileTreeNode | null): node is FileTreeNode {
  return !!node && node.kind === 'file' && !node.targetKind
}
```

Inside `ProjectFileTree`, add:

```ts
  const singleFocusedFileNode = useCallback(
    (fallback: FileTreeNode): FileTreeNode | null => {
      const candidate = focusedNodeId ? (flatNodeById.get(focusedNodeId) ?? fallback) : fallback
      if (!isPlainFileNode(candidate)) return null
      if (selection.selected.size > 1) return null
      return candidate
    },
    [flatNodeById, focusedNodeId, selection.selected.size],
  )

  const copyFocusedFileContents = useCallback(
    async (node: FileTreeNode) => {
      if (!worktreePath) return
      const result = await readRepositoryFileTreeTextFile(repoId, worktreePath, node.absolutePath)
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      try {
        await navigator.clipboard.writeText(result.content)
        toast.success(t('file-tree.copy-file-contents-ok'))
      } catch (err) {
        toast.error(t('action.result-error'), {
          description: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [repoId, t, worktreePath],
  )

  const replaceFocusedFileContents = useCallback(
    async (node: FileTreeNode) => {
      if (!worktreePath) return
      let content = ''
      try {
        content = await navigator.clipboard.readText()
      } catch (err) {
        toast.error(t('action.result-error'), {
          description: err instanceof Error ? err.message : String(err),
        })
        return
      }
      const result = await replaceRepositoryFileTreeTextFile(repoId, worktreePath, node.absolutePath, content)
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      undoStackRef.current.push({
        kind: 'replaceTextFile',
        path: node.absolutePath,
        relativePath: node.relativePath,
        previousContent: result.previousContent,
      })
      await refreshParentDirectoryForPath(node.absolutePath)
      toast.success(t('file-tree.replace-file-contents-ok'))
    },
    [refreshParentDirectoryForPath, repoId, t, worktreePath],
  )
```

- [ ] **Step 4: Check content shortcuts before regular file-tree copy/paste**

At the top of `handleKeyDown`, after undo and Enter handling, add:

```ts
      const contentShortcut = contentClipboardShortcut(event.nativeEvent)
      if (contentShortcut && !renameNode && !createEntryTarget) {
        const target = singleFocusedFileNode(node)
        if (!target) return
        event.preventDefault()
        event.stopPropagation()
        if (contentShortcut === 'copy') void copyFocusedFileContents(target)
        else void replaceFocusedFileContents(target)
        return
      }
```

Update the callback dependencies for `handleKeyDown` to include:

```ts
copyFocusedFileContents,
createEntryTarget,
replaceFocusedFileContents,
renameNode,
singleFocusedFileNode,
```

This placement is required because the existing primary shortcut handler would otherwise treat `Cmd/Ctrl+Shift+C/V` as regular file tree copy/paste.

- [ ] **Step 5: Add undo support for text replacement**

In `runUndo`, add a branch before the paste delete branch:

```ts
      if (action.kind === 'replaceTextFile') {
        const result = await replaceRepositoryFileTreeTextFile(repoId, worktreePath, action.path, action.previousContent)
        if (!result.ok) {
          undoStackRef.current.push(action)
          toast.error(t(result.message))
          return
        }
        await refreshParentDirectoryForPath(action.path)
        setSelection({ selected: new Set([action.relativePath]), anchor: action.relativePath })
        setFocusedNodeId(action.relativePath)
        return
      }
```

Add `t` and `replaceRepositoryFileTreeTextFile` dependencies if the callback dependency list needs them.

- [ ] **Step 6: Run renderer shortcut tests**

Run:

```bash
bun run test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

## Task 7: I18n And Error Copy

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Add dictionary coverage test**

In `src/shared/i18n/dictionaries.test.ts`, add:

```ts
  test('includes file tree text content shortcut copy in every dictionary', () => {
    for (const dictionary of [en, zh, ja, ko]) {
      expect(dictionary['file-tree.new-file']).toBeTruthy()
      expect(dictionary['file-tree.new-file-input-label']).toBeTruthy()
      expect(dictionary['file-tree.copy-file-contents-ok']).toBeTruthy()
      expect(dictionary['file-tree.replace-file-contents-ok']).toBeTruthy()
      expect(dictionary['error.file-tree-text-file-too-large']).toBeTruthy()
      expect(dictionary['error.file-tree-binary-file']).toBeTruthy()
      expect(dictionary['error.file-tree-not-regular-file']).toBeTruthy()
    }
  })
```

- [ ] **Step 2: Run dictionary test and verify it fails**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL because keys are missing.

- [ ] **Step 3: Add i18n keys**

In `src/shared/i18n/en.ts`, add near file-tree keys:

```ts
  'file-tree.new-file': 'New file',
  'file-tree.new-file-input-label': 'File name',
  'file-tree.copy-file-contents-ok': 'File contents copied',
  'file-tree.replace-file-contents-ok': 'File contents replaced',
```

Add near error keys:

```ts
  'error.file-tree-text-file-too-large': 'The file is too large for text copy or replace.',
  'error.file-tree-binary-file': 'Only UTF-8 text files are supported.',
  'error.file-tree-not-regular-file': 'Only regular files are supported.',
```

In `src/shared/i18n/zh.ts`, add:

```ts
  'file-tree.new-file': '新建文件',
  'file-tree.new-file-input-label': '文件名',
  'file-tree.copy-file-contents-ok': '文件内容已复制',
  'file-tree.replace-file-contents-ok': '文件内容已替换',
  'error.file-tree-text-file-too-large': '文件过大，无法复制或替换文本内容。',
  'error.file-tree-binary-file': '仅支持 UTF-8 文本文件。',
  'error.file-tree-not-regular-file': '仅支持普通文件。',
```

In `src/shared/i18n/ja.ts`, add:

```ts
  'file-tree.new-file': '新規ファイル',
  'file-tree.new-file-input-label': 'ファイル名',
  'file-tree.copy-file-contents-ok': 'ファイル内容をコピーしました',
  'file-tree.replace-file-contents-ok': 'ファイル内容を置き換えました',
  'error.file-tree-text-file-too-large': 'ファイルが大きすぎるため、テキストのコピーまたは置換はできません。',
  'error.file-tree-binary-file': 'UTF-8 テキストファイルのみ対応しています。',
  'error.file-tree-not-regular-file': '通常ファイルのみ対応しています。',
```

In `src/shared/i18n/ko.ts`, add:

```ts
  'file-tree.new-file': '새 파일',
  'file-tree.new-file-input-label': '파일 이름',
  'file-tree.copy-file-contents-ok': '파일 내용을 복사했습니다',
  'file-tree.replace-file-contents-ok': '파일 내용을 교체했습니다',
  'error.file-tree-text-file-too-large': '파일이 너무 커서 텍스트를 복사하거나 교체할 수 없습니다.',
  'error.file-tree-binary-file': 'UTF-8 텍스트 파일만 지원합니다.',
  'error.file-tree-not-regular-file': '일반 파일만 지원합니다.',
```

- [ ] **Step 4: Run dictionary tests**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: PASS. If snapshot test reports dictionary snapshot mismatch, update only the expected snapshot artifact used by `src/shared/i18n/snapshot.test.ts` according to that test’s local pattern.

## Task 8: Final Verification And Architecture Guard

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
bun run test src/system/file-tree/local.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 4: Run full test suite if focused tests or typecheck touched broad shared contracts**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Review diff without committing**

Run:

```bash
git diff -- src/shared/file-tree.ts src/system/file-tree/local.ts src/system/file-tree/local.test.ts src/system/ssh/commands.ts src/system/ssh/commands.test.ts src/system/ssh/git.ts src/system/ssh/git.test.ts src/server/modules/repo-read-paths.ts src/server/modules/repo-write-paths.ts src/server/modules/repo.test.ts src/server/routes/repo.ts src/server/routes/repo.test.ts src/web/repo-client.ts src/web/components/file-tree/ProjectFileTree.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts
```

Expected: diff contains only the planned feature and related tests/i18n. Do not stage changes or create a commit unless the user explicitly asks.

## Self-Review

- Spec coverage: toolbar and context-menu new-file entry points are covered in Task 5; empty-file local/remote/server support is covered in Tasks 1-4; content copy/replace and undo are covered in Task 6; UTF-8, binary, and 1 MB limits are covered in Tasks 1-3; i18n and user feedback are covered in Tasks 6-7.
- Placeholder scan: no unresolved markers or unspecified implementation steps are used.
- Type consistency: shared result names are `RepoFileTreeTextFileReadResult` and `RepoFileTreeTextFileReplaceResult`; client/server/helper names consistently use `create...File`, `read...TextFile`, and `replace...TextFile`.
