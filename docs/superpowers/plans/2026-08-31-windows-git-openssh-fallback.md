# Windows Git OpenSSH Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover local Windows Git operations from the exact Git for Windows bundled-SSH MSYS `add_item ... errno 1` startup failure by retrying once through Windows native OpenSSH.

**Architecture:** Keep the first Git invocation and every non-matching outcome unchanged. Add a trusted native Windows OpenSSH resolver under `src/system/ssh/`, then let the centralized native Git helper make one cancellation-aware fallback invocation only for the tightly matched pre-connection MSYS failure. WSL and SSH-host repositories keep using their existing remote runner and never enter this path.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Node `path`/`fs`, Execa 9, Vitest 4, Git for Windows, Windows native OpenSSH

## Global Constraints

- Execute inline in the current linked worktree on `feat/20260825-opt`; do not create another worktree or delegate to subagents.
- Preserve unrelated user changes and stage only files named by the active task.
- Use repo-alias imports with explicit `.ts` extensions.
- Do not change remotes, Git configuration, settings, UI state, protocol payloads, WSL behavior, SSH-host behavior, or the independent `windows/` package.
- Do not introduce a generic retry. Retry only the complete SSH/MSYS `add_item`, root-mount, `errno 1` diagnostic.
- Preserve explicit `GIT_SSH` and `GIT_SSH_COMMAND` environment overrides case-insensitively.
- The named `.claude/skills/grill-with-docs/SKILL.md` is absent. This plan has instead been checked directly against `docs/arch.md`, `docs/layering.md`, `docs/state-sync.md`, `docs/realtime.md`, and `docs/superpowers/specs/2026-08-23-primary-windows-native-wsl-git-terminal-design.md`.

---

### Task 1: Resolve the trusted Windows native OpenSSH executable

**Files:**

- Create: `src/system/ssh/executable.test.ts`
- Create: `src/system/ssh/executable.ts`

- [ ] **Step 1: Write the failing resolver tests**

Create `src/system/ssh/executable.test.ts`:

```ts
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { resolveNativeWindowsOpenSshExecutable } from '#/system/ssh/executable.ts'

describe('resolveNativeWindowsOpenSshExecutable', () => {
  test('resolves the trusted SystemRoot OpenSSH executable case-insensitively', () => {
    const fileExists = existingFiles('C:\\Windows\\System32\\OpenSSH\\ssh.exe')

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { systemroot: 'C:\\Windows' },
        fileExists,
      }),
    ).toBe('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
  })

  test('deduplicates equivalent SystemRoot and WINDIR candidates', () => {
    const fileExists = vi.fn(existingFiles('C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe'))

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { SystemRoot: 'C:\\WINDOWS', windir: 'C:\\Windows' },
        fileExists,
      }),
    ).toBe('C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe')
    expect(fileExists).toHaveBeenCalledTimes(1)
  })

  test('uses WINDIR when SystemRoot is absent', () => {
    const fileExists = existingFiles('D:\\Windows\\System32\\OpenSSH\\ssh.exe')

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { windir: 'D:\\Windows' },
        fileExists,
      }),
    ).toBe('D:\\Windows\\System32\\OpenSSH\\ssh.exe')
  })

  test('returns null for missing, relative, or non-Windows candidates', () => {
    const fileExists = vi.fn(() => false)

    expect(
      resolveNativeWindowsOpenSshExecutable({ platform: 'win32', env: { SystemRoot: 'Windows' }, fileExists }),
    ).toBeNull()
    expect(resolveNativeWindowsOpenSshExecutable({ platform: 'win32', env: {}, fileExists })).toBeNull()
    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'linux',
        env: { SystemRoot: 'C:\\Windows' },
        fileExists,
      }),
    ).toBeNull()
    expect(fileExists).not.toHaveBeenCalled()
  })
})

function existingFiles(...files: string[]): (candidate: string) => boolean {
  const normalized = new Set(files.map((file) => path.win32.normalize(file).toLowerCase()))
  return (candidate) => normalized.has(path.win32.normalize(candidate).toLowerCase())
}
```

- [ ] **Step 2: Run the test and verify RED**

Run `bun run test -- src/system/ssh/executable.test.ts`.

Expected: FAIL because `src/system/ssh/executable.ts` or `resolveNativeWindowsOpenSshExecutable` does not exist.

- [ ] **Step 3: Implement the minimal trusted resolver**

Create `src/system/ssh/executable.ts`:

```ts
import { statSync } from 'node:fs'
import path from 'node:path'

interface ResolveNativeWindowsOpenSshExecutableOptions {
  platform?: NodeJS.Platform | string
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

export function resolveNativeWindowsOpenSshExecutable(
  options: ResolveNativeWindowsOpenSshExecutableOptions = {},
): string | null {
  if ((options.platform ?? process.platform) !== 'win32') return null

  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? isFile
  const seen = new Set<string>()
  for (const name of ['SYSTEMROOT', 'WINDIR']) {
    const root = environmentValue(env, name)
    if (!root || root.includes('\0') || !path.win32.isAbsolute(root)) continue
    const candidate = path.win32.normalize(path.win32.join(root, 'System32', 'OpenSSH', 'ssh.exe'))
    const identity = candidate.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    if (fileExists(candidate)) return candidate
  }
  return null
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run `bun run test -- src/system/ssh/executable.test.ts` and expect every resolver test to PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/system/ssh/executable.ts src/system/ssh/executable.test.ts
git commit -m "feat: resolve Windows native OpenSSH"
```

### Task 2: Retry the exact MSYS SSH startup failure once

**Files:**

- Modify: `src/system/git/helper-network.test.ts`
- Modify: `src/system/git/helper.ts`

- [ ] **Step 1: Add the failing Git-helper tests**

Extend the hoisted mocks in `src/system/git/helper-network.test.ts` with `resolveNativeWindowsOpenSshExecutableMock`, mock `#/system/ssh/executable.ts`, and reset it to `C:\\Windows\\System32\\OpenSSH\\ssh.exe` in `beforeEach`:

```ts
const { execaMock, resolveGitExecutableMock, resolveNativeWindowsOpenSshExecutableMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  resolveGitExecutableMock: vi.fn(),
  resolveNativeWindowsOpenSshExecutableMock: vi.fn(),
}))

vi.mock('#/system/ssh/executable.ts', () => ({
  resolveNativeWindowsOpenSshExecutable: resolveNativeWindowsOpenSshExecutableMock,
}))
```

Add this fixture and tests inside the existing describe block:

```ts
function msysSshStartupError(): MockExecaError {
  const error = new MockExecaError('Git SSH failed')
  error.stderr =
    '0 [main] ssh (1584) C:\\Program Files\\Git\\usr\\bin\\ssh.exe: *** fatal error - add_item ("\\??\\C:\\Program Files\\Git", "/", ...) failed, errno 1'
  return error
}

test('retries the exact MSYS SSH startup failure once with native Windows OpenSSH', async () => {
  execaMock.mockRejectedValueOnce(msysSshStartupError()).mockResolvedValueOnce({ stdout: 'resolved\n', stderr: '' })
  const { buildGitNetworkEnv, git } = await import('#/system/git/helper.ts')

  await expect(
    git('/repo', ['fetch'], { timeoutMs: 120_000, env: buildGitNetworkEnv('http://127.0.0.1:7890') }),
  ).resolves.toBe('resolved')

  expect(execaMock).toHaveBeenCalledTimes(2)
  expect(execaMock).toHaveBeenNthCalledWith(
    2,
    'git',
    ['fetch'],
    expect.objectContaining({
      cwd: '/repo',
      timeout: 120_000,
      env: expect.objectContaining({
        HTTPS_PROXY: 'http://127.0.0.1:7890',
        GIT_SSH: 'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
        GIT_SSH_VARIANT: 'ssh',
      }),
    }),
  )
})

test('does not retry unrelated SSH failures or an unavailable native OpenSSH executable', async () => {
  const permissionDenied = new MockExecaError('Permission denied')
  permissionDenied.stderr = 'git@github.com: Permission denied (publickey).'
  execaMock.mockRejectedValueOnce(permissionDenied)
  const { git } = await import('#/system/git/helper.ts')

  await expect(git('/repo', ['fetch'])).rejects.toBe(permissionDenied)
  expect(execaMock).toHaveBeenCalledTimes(1)

  execaMock.mockReset()
  execaMock.mockRejectedValueOnce(msysSshStartupError())
  resolveNativeWindowsOpenSshExecutableMock.mockReturnValueOnce(null)
  await expect(git('/repo', ['fetch'])).rejects.toBeInstanceOf(MockExecaError)
  expect(execaMock).toHaveBeenCalledTimes(1)
})

test.each(['GIT_SSH', 'git_ssh_command'])(
  'preserves the explicit %s environment override instead of retrying',
  async (name) => {
    const error = msysSshStartupError()
    execaMock.mockRejectedValueOnce(error)
    const { git } = await import('#/system/git/helper.ts')

    await expect(git('/repo', ['fetch'], { env: { [name]: 'custom-ssh' } })).rejects.toBe(error)
    expect(execaMock).toHaveBeenCalledTimes(1)
  },
)

test('does not retry after cancellation', async () => {
  const controller = new AbortController()
  const error = msysSshStartupError()
  execaMock.mockImplementationOnce(async () => {
    controller.abort()
    throw error
  })
  const { git } = await import('#/system/git/helper.ts')

  await expect(git('/repo', ['fetch'], { signal: controller.signal })).rejects.toBe(error)
  expect(execaMock).toHaveBeenCalledTimes(1)
})
```

Also add one inherited-environment case that restores process state in `finally`:

```ts
test('preserves an inherited GIT_SSH_COMMAND override instead of retrying', async () => {
  const original = process.env.GIT_SSH_COMMAND
  process.env.GIT_SSH_COMMAND = 'custom-ssh'
  const error = msysSshStartupError()
  execaMock.mockRejectedValueOnce(error)
  const { git } = await import('#/system/git/helper.ts')

  try {
    await expect(git('/repo', ['fetch'])).rejects.toBe(error)
    expect(execaMock).toHaveBeenCalledTimes(1)
  } finally {
    if (original === undefined) delete process.env.GIT_SSH_COMMAND
    else process.env.GIT_SSH_COMMAND = original
  }
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run `bun run test -- src/system/git/helper-network.test.ts`.

Expected: the fallback test FAILS because the current helper rejects after the first Execa failure and never invokes the native OpenSSH resolver.

- [ ] **Step 3: Implement the single-attempt fallback**

Import the resolver in `src/system/git/helper.ts`:

```ts
import { resolveNativeWindowsOpenSshExecutable } from '#/system/ssh/executable.ts'
```

Replace the current `git` implementation with an async wrapper and these focused helpers:

```ts
export async function git(cwd: string, args: string[], opts?: GitOptions): Promise<string> {
  const executable = resolveGitExecutable()
  if (!executable) throw gitExecutableNotFoundError()
  const env = gitEnvironment(opts?.env)
  try {
    return await runGit(executable, cwd, args, opts, env)
  } catch (error) {
    const fallbackSsh = windowsOpenSshFallback(error, opts)
    if (!fallbackSsh) throw error
    return await runGit(executable, cwd, args, opts, {
      ...env,
      GIT_SSH: fallbackSsh,
      GIT_SSH_VARIANT: 'ssh',
    })
  }
}

async function runGit(
  executable: string,
  cwd: string,
  args: string[],
  opts: GitOptions | undefined,
  env: Record<string, string>,
): Promise<string> {
  const { stdout } = await execa(executable, args, {
    cwd,
    timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    cancelSignal: opts?.signal,
    env,
    forceKillAfterDelay: 500,
    // Some repos can produce large outputs (log, for-each-ref). 10MB headroom.
    maxBuffer: 10 * 1024 * 1024,
    input: opts?.stdin,
  })
  return stdout.trimEnd()
}

function gitEnvironment(env: Record<string, string> | undefined): Record<string, string> {
  return {
    ...(env ?? {}),
    LANGUAGE: 'en',
    LC_ALL: 'en_US.UTF-8',
    LANG: 'en_US.UTF-8',
    GIT_PAGER: 'cat',
  }
}

function windowsOpenSshFallback(error: unknown, opts: GitOptions | undefined): string | null {
  if (opts?.signal?.aborted || hasExplicitGitSshEnvironment(opts?.env)) return null
  if (!(error instanceof ExecaError) || typeof error.stderr !== 'string' || !isMsysSshStartupFailure(error.stderr)) {
    return null
  }
  return resolveNativeWindowsOpenSshExecutable()
}

function hasExplicitGitSshEnvironment(env: Record<string, string> | undefined): boolean {
  return [process.env, env].some((values) =>
    Object.keys(values ?? {}).some(
      (name) => name.toUpperCase() === 'GIT_SSH' || name.toUpperCase() === 'GIT_SSH_COMMAND',
    ),
  )
}

function isMsysSshStartupFailure(stderr: string): boolean {
  return stderr
    .split(/\r?\n/u)
    .some(
      (line) =>
        /ssh(?:\.exe)?/iu.test(line) &&
        line.includes('*** fatal error - add_item (') &&
        line.includes('", "/", ...) failed, errno 1'),
    )
}
```

Do not export the classification helpers; their observable contract is the second Git invocation.

- [ ] **Step 4: Verify GREEN and adjacent helper behavior**

Run:

```powershell
bun run test -- src/system/git/helper-network.test.ts src/system/git/helper.test.ts src/system/git/executable.test.ts
```

Expected: all Git helper and executable tests PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- src/system/git/helper.ts src/system/git/helper-network.test.ts
git commit -m "fix: recover Windows Git from MSYS SSH startup failure"
```

### Task 3: Verify architecture, behavior, and scope

**Files:**

- Review: `src/system/ssh/executable.ts`
- Review: `src/system/ssh/executable.test.ts`
- Review: `src/system/git/helper.ts`
- Review: `src/system/git/helper-network.test.ts`
- Review: `docs/superpowers/specs/2026-08-31-windows-git-openssh-fallback-design.md`
- Review: `docs/superpowers/plans/2026-08-31-windows-git-openssh-fallback.md`

- [ ] **Step 1: Run focused regression tests**

```powershell
bun run test -- src/system/ssh/executable.test.ts src/system/git/helper-network.test.ts src/system/git/helper.test.ts src/system/git/executable.test.ts
```

- [ ] **Step 2: Run strip-only TypeScript validation**

Run `bun run typecheck` and require exit code 0.

- [ ] **Step 3: Run the architecture guard**

Run `bun run check:architecture` and require exit code 0.

- [ ] **Step 4: Run the full Vitest suite**

Run `bun run test` and record the exact file and test totals.

- [ ] **Step 5: Check formatting and diff hygiene**

```powershell
bunx prettier --check src/system/ssh/executable.ts src/system/ssh/executable.test.ts src/system/git/helper.ts src/system/git/helper-network.test.ts docs/superpowers/specs/2026-08-31-windows-git-openssh-fallback-design.md docs/superpowers/plans/2026-08-31-windows-git-openssh-fallback.md
git diff --check
git status --short
git log -4 --oneline --decorate
```

Expected: all commands exit successfully; only the planned commits are new; WSL/SSH backend files, remote URLs, settings, UI, and the independent `windows/` package remain unchanged.

- [ ] **Step 6: Handle verification corrections atomically**

If verification exposes a defect, add or tighten a failing focused test first, make the minimum correction, rerun the affected focused test and every verification command above, then commit only that correction with a precise `fix:` message.

## Manual Architecture Grill Result

- The fallback belongs in `src/system/git/helper.ts`, the narrowest common owner of application-owned local Git process execution.
- `resolveRepoBackend` routes `wsl://` and `ssh-config://` identities to `createRemoteRepoBackend`, so they do not call the native helper and cannot receive `GIT_SSH` from this change.
- A `src/system/ssh/executable.ts` resolver is a focused system-integration module and introduces no forbidden server/web/Electron dependency.
- Matching a pre-connection SSH runtime crash is sufficiently narrow to retry push safely; generic transport and authentication failures remain single-attempt.
- Explicit SSH environment overrides take precedence over recovery. Repository and global Git configuration are never written.
- No renderer state, server state, invalidation, streaming, or persistence is involved.

## Self-Review

- Spec coverage: backend separation, Windows SSH operation scope, exact classification, explicit overrides, native resolver trust, cancellation, option preservation, tests, and full verification each map to explicit steps.
- Placeholder scan: no deferred implementation choice or unspecified error handling remains.
- Type consistency: all imports use canonical aliases with `.ts`; all new types are interfaces or ordinary functions compatible with Node strip-only mode.
- Safety: no destructive Git command, remote mutation, repository configuration write, or generic retry is introduced.
