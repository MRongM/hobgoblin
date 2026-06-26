# Git Network Proxy Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings > Proxy page that configures local Git network proxy and timeout for fetch, pull, push, and clone.

**Architecture:** Keep settings ownership in the server and keep Git execution in the system layer. The web layer writes settings through existing settings paths; server repo write paths convert settings into a small Git network options object; local Git helpers apply timeout and command-scoped proxy environment variables. SSH remote repo operations ignore this local proxy setting.

**Tech Stack:** TypeScript strip-only mode, React, Zustand, Hono server routes, Electron renderer bootstrap, execa, Vitest, Bun.

---

## Project Overrides

- Do not add git commit steps. Project instructions explicitly say not to plan or execute git commits unless the user asks.
- Do not create a new git branch or worktree.
- Keep TypeScript strip-only safe: no enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Keep network proxy support scoped to local Git `fetch`, `pull`, `push`, and `clone`.
- Do not write user Git config, repository config, shell profiles, or system environment.

## File Map

- Modify: `src/shared/settings.ts`
  - Add Git network setting fields and min/max timeout constants.
- Modify: `src/shared/settings-defaults.ts`
  - Add defaults and include them in default settings and initial bootstrap settings.
- Modify: `src/shared/bootstrap.ts`
  - Add Git network fields to `InitialSettingsSnapshot`.
- Modify: `src/shared/settings-snapshot.ts`
  - Include Git network fields in runtime settings projection.
- Modify: `src/shared/settings-defaults.test.ts`
  - Assert new defaults.
- Modify: `src/shared/settings-snapshot.test.ts`
  - Assert runtime projection keeps new fields.
- Modify: `src/server/modules/settings-source.ts`
  - Persist and normalize new settings fields.
- Modify: `src/server/modules/settings-source.test.ts`
  - Cover defaults, persistence, URL validation, and timeout clamp.
- Create: `src/server/modules/git-network-settings.ts`
  - Convert server settings prefs into system-layer Git network options.
- Create: `src/server/modules/git-network-settings.test.ts`
  - Unit test settings-to-options conversion.
- Modify: `src/system/git/helper.ts`
  - Add command-scoped proxy env support and exported proxy env builder.
- Create: `src/system/git/helper-network.test.ts`
  - Unit test proxy env construction and timeout message behavior.
- Modify: `src/system/git/remote.ts`
  - Thread Git network options into local fetch, pull, and push commands.
- Modify: `src/system/git/remote.test.ts`
  - Assert local network commands pass timeout and proxy env through.
- Modify: `src/system/git/clone.ts`
  - Thread Git network options into clone.
- Create: `src/system/git/clone.test.ts`
  - Assert clone uses configured timeout and proxy env.
- Modify: `src/server/modules/repo-backend.ts`
  - Let local backend methods receive Git network options; remote backend ignores them.
- Modify: `src/server/modules/repo-write-paths.ts`
  - Read settings before local network operations and pass options to backend/system calls.
- Modify: `src/server/modules/repo.test.ts`
  - Assert fetch/pull/push/clone use configured network options locally and remote backend ignores them.
- Modify: `src/web/settings-client.ts`
  - Add settings client writers for proxy enabled, proxy URL, and timeout seconds.
- Modify: `src/web/settings-write-paths.ts`
  - Add cache-updating write-path helpers for Git network settings.
- Modify: `src/web/settings-write-paths.test.ts`
  - Assert cache updates for new write paths.
- Modify: `src/web/settings-read-projection.ts`
  - Add runtime reader for Git network settings.
- Create: `src/web/runtime-settings-git-network.ts`
  - Add hook/controller for the proxy settings page.
- Modify: `src/shared/settings-pages.ts`
  - Add the `proxy` settings page and nav config.
- Create: `src/web/components/settings/pages/ProxySettings.tsx`
  - Add the new Settings > Proxy page.
- Modify: `src/web/components/SettingsSurface.tsx`
  - Render `ProxySettings`.
- Modify: `src/shared/i18n/en.ts`
  - Add English proxy settings copy.
- Modify: `src/shared/i18n/zh.ts`
  - Add Simplified Chinese proxy settings copy.
- Modify: `src/shared/i18n/ko.ts`
  - Add Korean proxy settings copy.
- Modify: `src/shared/i18n/ja.ts`
  - Add Japanese proxy settings copy.
- Modify: `src/web/components/SettingsSurface.test.tsx`
  - Assert the proxy page renders and writes settings.
- Update test fixtures that construct full `InitialSettingsSnapshot` or full `SettingsPrefs`.

## Task 1: Add Shared Settings Fields And Projections

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/settings-defaults.test.ts`
- Modify: `src/shared/settings-snapshot.test.ts`

- [ ] **Step 1: Add shared setting fields and constants**

In `src/shared/settings.ts`, add the timeout constants near the other settings constants:

```ts
export const MIN_GIT_NETWORK_TIMEOUT_SEC = 15
export const MAX_GIT_NETWORK_TIMEOUT_SEC = 900
```

In the `SettingsPrefs` interface, add:

```ts
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
```

- [ ] **Step 2: Add defaults**

In `src/shared/settings-defaults.ts`, import the new constants from `#/shared/settings.ts` and add defaults near `DEFAULT_FETCH_INTERVAL_SEC`:

```ts
export const DEFAULT_GIT_NETWORK_PROXY_ENABLED = false
export const DEFAULT_GIT_NETWORK_PROXY_URL = ''
export const DEFAULT_GIT_NETWORK_TIMEOUT_SEC = 120
```

In `defaultSettingsPrefs()`, add:

```ts
    gitNetworkProxyEnabled:
      overrides.gitNetworkProxyEnabled ?? DEFAULT_GIT_NETWORK_PROXY_ENABLED,
    gitNetworkProxyUrl:
      overrides.gitNetworkProxyUrl ?? DEFAULT_GIT_NETWORK_PROXY_URL,
    gitNetworkTimeoutSec:
      overrides.gitNetworkTimeoutSec ?? DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
```

In `initialSettingsFromSnapshot()`:

1. Add these fields to the `Pick<SettingsSnapshot, ...>` type list:

```ts
  | 'gitNetworkProxyEnabled'
  | 'gitNetworkProxyUrl'
  | 'gitNetworkTimeoutSec'
```

2. Add these fields to the returned object:

```ts
    gitNetworkProxyEnabled: snapshot.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: snapshot.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: snapshot.gitNetworkTimeoutSec,
```

Re-export the min/max constants from `settings-defaults.ts` with the existing settings constants:

```ts
  MAX_GIT_NETWORK_TIMEOUT_SEC,
  MIN_GIT_NETWORK_TIMEOUT_SEC,
```

- [ ] **Step 3: Add bootstrap fields**

In `src/shared/bootstrap.ts`, add to `InitialSettingsSnapshot`:

```ts
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
```

- [ ] **Step 4: Add settings snapshot projection fields**

In `src/shared/settings-snapshot.ts`, add to `buildRuntimeSettingsSnapshot()`:

```ts
    gitNetworkProxyEnabled: input.prefs.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: input.prefs.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: input.prefs.gitNetworkTimeoutSec,
```

Add the same three keys to the `Pick<SettingsSnapshot, ...>` type in `runtimeSettingsSnapshotFromSettingsSnapshot()`, then add them to the returned object:

```ts
    gitNetworkProxyEnabled: snapshot.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: snapshot.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: snapshot.gitNetworkTimeoutSec,
```

- [ ] **Step 5: Write shared defaults tests**

In `src/shared/settings-defaults.test.ts`, extend the imports:

```ts
  DEFAULT_GIT_NETWORK_PROXY_ENABLED,
  DEFAULT_GIT_NETWORK_PROXY_URL,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
```

Add this test:

```ts
  test('defaults git network proxy off with a 120 second timeout', () => {
    expect(DEFAULT_GIT_NETWORK_PROXY_ENABLED).toBe(false)
    expect(DEFAULT_GIT_NETWORK_PROXY_URL).toBe('')
    expect(DEFAULT_GIT_NETWORK_TIMEOUT_SEC).toBe(120)
    expect(defaultSettingsPrefs()).toMatchObject({
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
    })
  })
```

- [ ] **Step 6: Update settings snapshot tests**

In `src/shared/settings-snapshot.test.ts`, add these fields to both `prefs` literals:

```ts
          gitNetworkProxyEnabled: true,
          gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
          gitNetworkTimeoutSec: 180,
```

For the second `prefs` literal, use:

```ts
        gitNetworkProxyEnabled: false,
        gitNetworkProxyUrl: '',
        gitNetworkTimeoutSec: 120,
```

In the first expected `toEqual()` object, add:

```ts
      gitNetworkProxyEnabled: true,
      gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
      gitNetworkTimeoutSec: 180,
```

In the `runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)` `toMatchObject()`, add:

```ts
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
```

- [ ] **Step 7: Run shared settings tests and confirm they fail before implementation**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts
```

Expected before implementation: FAIL with TypeScript/runtime errors for missing Git network settings fields.

- [ ] **Step 8: Implement shared settings fields**

Apply the changes from Steps 1-4.

- [ ] **Step 9: Run shared settings tests again**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts
```

Expected after implementation: PASS.

## Task 2: Persist And Normalize Git Network Settings On The Server

**Files:**
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Create: `src/server/modules/git-network-settings.ts`
- Create: `src/server/modules/git-network-settings.test.ts`

- [ ] **Step 1: Write failing server settings tests**

In `src/server/modules/settings-source.test.ts`, update the defaults expectation in `initializes server-settings.json with defaults when no persisted settings exist`:

```ts
    gitNetworkProxyEnabled: false,
    gitNetworkProxyUrl: '',
    gitNetworkTimeoutSec: 120,
```

In `persists updates and notifies subscribers from the server settings store`, add to the update patch:

```ts
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
```

Add to the reloaded expectation:

```ts
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
```

Add this test:

```ts
test('normalizes invalid git network proxy and clamps timeout seconds', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'ftp://127.0.0.1:21',
    gitNetworkTimeoutSec: 9999,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    gitNetworkProxyUrl: string
    gitNetworkTimeoutSec: number
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: '',
    gitNetworkTimeoutSec: 900,
  })

  await mod.updateServerSettingsPrefs({
    gitNetworkProxyUrl: ' socks5://127.0.0.1:7890 ',
    gitNetworkTimeoutSec: 1,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    gitNetworkProxyUrl: string
    gitNetworkTimeoutSec: number
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 15,
  })
})
```

- [ ] **Step 2: Run server settings tests and confirm they fail**

Run:

```bash
bun run test -- src/server/modules/settings-source.test.ts
```

Expected before implementation: FAIL because settings source does not persist or normalize the new fields.

- [ ] **Step 3: Implement normalization in settings source**

In `src/server/modules/settings-source.ts`, extend `ServerSettingsData`:

```ts
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
```

Import the timeout constants and defaults from `#/shared/settings-defaults.ts`.

Add normalization helpers near the other settings normalizers:

```ts
function normalizeGitNetworkProxyEnabled(value: unknown): boolean {
  return value === true
}

function normalizeGitNetworkProxyUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'socks5:' ? trimmed : ''
  } catch {
    return ''
  }
}

function normalizeGitNetworkTimeoutSec(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GIT_NETWORK_TIMEOUT_SEC
  return Math.max(MIN_GIT_NETWORK_TIMEOUT_SEC, Math.min(MAX_GIT_NETWORK_TIMEOUT_SEC, Math.round(value)))
}
```

Add the fields in `settingsPrefsFromData()`:

```ts
    gitNetworkProxyEnabled: data.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: data.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: data.gitNetworkTimeoutSec,
```

Add the fields in `readServerSettingsFile()`:

```ts
      gitNetworkProxyEnabled: normalizeGitNetworkProxyEnabled(parsed.gitNetworkProxyEnabled),
      gitNetworkProxyUrl: normalizeGitNetworkProxyUrl(parsed.gitNetworkProxyUrl),
      gitNetworkTimeoutSec: normalizeGitNetworkTimeoutSec(parsed.gitNetworkTimeoutSec),
```

Add `nextGitNetworkProxyEnabled`, `nextGitNetworkProxyUrl`, and `nextGitNetworkTimeoutSec` in `updateServerSettingsPrefs()`:

```ts
  const nextGitNetworkProxyEnabled =
    patch.gitNetworkProxyEnabled === undefined
      ? data.gitNetworkProxyEnabled
      : normalizeGitNetworkProxyEnabled(patch.gitNetworkProxyEnabled)
  const nextGitNetworkProxyUrl =
    patch.gitNetworkProxyUrl === undefined
      ? data.gitNetworkProxyUrl
      : normalizeGitNetworkProxyUrl(patch.gitNetworkProxyUrl)
  const nextGitNetworkTimeoutSec =
    patch.gitNetworkTimeoutSec === undefined
      ? data.gitNetworkTimeoutSec
      : normalizeGitNetworkTimeoutSec(patch.gitNetworkTimeoutSec)
```

Include them in the `changed` expression:

```ts
    data.gitNetworkProxyEnabled !== nextGitNetworkProxyEnabled ||
    data.gitNetworkProxyUrl !== nextGitNetworkProxyUrl ||
    data.gitNetworkTimeoutSec !== nextGitNetworkTimeoutSec ||
```

Assign them before writing:

```ts
  data.gitNetworkProxyEnabled = nextGitNetworkProxyEnabled
  data.gitNetworkProxyUrl = nextGitNetworkProxyUrl
  data.gitNetworkTimeoutSec = nextGitNetworkTimeoutSec
```

- [ ] **Step 4: Create server settings-to-network-options helper tests**

Create `src/server/modules/git-network-settings.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { gitNetworkOptionsFromPrefs } from '#/server/modules/git-network-settings.ts'
import { defaultSettingsPrefs } from '#/shared/settings-defaults.ts'

describe('gitNetworkOptionsFromPrefs', () => {
  test('returns timeout only when proxy is disabled', () => {
    expect(gitNetworkOptionsFromPrefs(defaultSettingsPrefs())).toEqual({
      timeoutMs: 120_000,
    })
  })

  test('includes proxy URL only when proxy is enabled and non-empty', () => {
    expect(
      gitNetworkOptionsFromPrefs(
        defaultSettingsPrefs({
          gitNetworkProxyEnabled: true,
          gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
          gitNetworkTimeoutSec: 240,
        }),
      ),
    ).toEqual({
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })
})
```

- [ ] **Step 5: Create settings-to-network-options helper**

Create `src/server/modules/git-network-settings.ts`:

```ts
import type { GitNetworkOptions } from '#/system/git/helper.ts'
import type { SettingsPrefs } from '#/shared/settings.ts'

export function gitNetworkOptionsFromPrefs(
  prefs: Pick<SettingsPrefs, 'gitNetworkProxyEnabled' | 'gitNetworkProxyUrl' | 'gitNetworkTimeoutSec'>,
): GitNetworkOptions {
  const proxyUrl = prefs.gitNetworkProxyEnabled && prefs.gitNetworkProxyUrl ? prefs.gitNetworkProxyUrl : undefined
  return {
    timeoutMs: prefs.gitNetworkTimeoutSec * 1000,
    ...(proxyUrl ? { proxyUrl } : {}),
  }
}
```

- [ ] **Step 6: Run server settings tests**

Run:

```bash
bun run test -- src/server/modules/settings-source.test.ts src/server/modules/git-network-settings.test.ts
```

Expected after implementation: PASS.

## Task 3: Add Git Helper Proxy Env And Local Git Network Options

**Files:**
- Modify: `src/system/git/helper.ts`
- Create: `src/system/git/helper-network.test.ts`
- Modify: `src/system/git/remote.ts`
- Modify: `src/system/git/remote.test.ts`
- Modify: `src/system/git/clone.ts`
- Create: `src/system/git/clone.test.ts`

- [ ] **Step 1: Write Git helper network tests**

Create `src/system/git/helper-network.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

class MockExecaError extends Error {
  timedOut = false
  isCanceled = false
  stderr = ''
}

const execaMock = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: execaMock,
  ExecaError: MockExecaError,
}))

describe('git network helper options', () => {
  beforeEach(() => {
    execaMock.mockReset()
    execaMock.mockResolvedValue({ stdout: 'ok\n', stderr: '' })
  })

  test('does not build proxy env for missing or unsupported proxy urls', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv(undefined)).toBeUndefined()
    expect(buildGitNetworkEnv('')).toBeUndefined()
    expect(buildGitNetworkEnv('ftp://127.0.0.1:21')).toBeUndefined()
  })

  test('builds HTTP and HTTPS proxy env variables', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv('http://127.0.0.1:7890')).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
    })
  })

  test('builds SOCKS5 proxy env variables', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv('socks5://127.0.0.1:7890')).toEqual({
      ALL_PROXY: 'socks5://127.0.0.1:7890',
      HTTPS_PROXY: 'socks5://127.0.0.1:7890',
      all_proxy: 'socks5://127.0.0.1:7890',
      https_proxy: 'socks5://127.0.0.1:7890',
    })
  })

  test('passes env to execa for a git invocation', async () => {
    const { buildGitNetworkEnv, git } = await import('#/system/git/helper.ts')
    const env = buildGitNetworkEnv('socks5://127.0.0.1:7890')

    await expect(git('/repo', ['fetch'], { timeoutMs: 120_000, env })).resolves.toBe('ok')

    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['fetch'],
      expect.objectContaining({
        cwd: '/repo',
        timeout: 120_000,
        env,
      }),
    )
  })

  test('reports timeout using the configured timeout seconds', async () => {
    const err = new MockExecaError('timed out')
    err.timedOut = true
    execaMock.mockRejectedValueOnce(err)
    const { gitResultWithOptions } = await import('#/system/git/helper.ts')

    await expect(gitResultWithOptions('/repo', { timeoutMs: 120_000 }, 'fetch')).resolves.toEqual({
      ok: false,
      message: 'git timed out after 120s',
    })
  })
})
```

- [ ] **Step 2: Run helper network tests and confirm they fail**

Run:

```bash
bun run test -- src/system/git/helper-network.test.ts
```

Expected before implementation: FAIL because `buildGitNetworkEnv`, `GitNetworkOptions`, and `GitOptions.env` do not exist.

- [ ] **Step 3: Implement helper env support**

In `src/system/git/helper.ts`, add:

```ts
export interface GitNetworkOptions {
  timeoutMs: number
  proxyUrl?: string
}
```

Extend `GitOptions`:

```ts
  /** Extra environment variables for this git child process only. */
  env?: Record<string, string>
```

Add:

```ts
export function buildGitNetworkEnv(proxyUrl?: string): Record<string, string> | undefined {
  if (!proxyUrl) return undefined
  let parsed: URL
  try {
    parsed = new URL(proxyUrl)
  } catch {
    return undefined
  }
  const normalized = proxyUrl.trim()
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return {
      HTTP_PROXY: normalized,
      HTTPS_PROXY: normalized,
      http_proxy: normalized,
      https_proxy: normalized,
    }
  }
  if (parsed.protocol === 'socks5:') {
    return {
      ALL_PROXY: normalized,
      HTTPS_PROXY: normalized,
      all_proxy: normalized,
      https_proxy: normalized,
    }
  }
  return undefined
}

export function gitNetworkOptions(
  options: GitNetworkOptions | undefined,
  fallbackTimeoutMs: number,
  signal?: AbortSignal,
): GitOptions {
  return {
    timeoutMs: options?.timeoutMs ?? fallbackTimeoutMs,
    signal,
    env: buildGitNetworkEnv(options?.proxyUrl),
  }
}
```

In `git()`, pass `env` into `execa`:

```ts
    env: opts?.env,
```

- [ ] **Step 4: Write local fetch/pull/push option tests**

In `src/system/git/remote.test.ts`, extend the helper mock:

```ts
const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
```

Change the test import to include `beforeEach`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
```

Update the `vi.mock('#/system/git/helper.ts', ...)` return object:

```ts
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
```

Add a `beforeEach` in the file:

```ts
beforeEach(() => {
  gitMock.mockReset()
  gitResultWithOptionsMock.mockReset()
  gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'ok' })
})
```

Add tests:

```ts
describe('local network git options', () => {
  test('pullBranch uses configured network options for a concrete worktree path', async () => {
    const { pullBranch } = await import('#/system/git/remote.ts')
    const signal = new AbortController().signal

    await expect(
      pullBranch('/repo', 'feature/a', '/repo-feature-a', signal, {
        timeoutMs: 120_000,
        proxyUrl: 'socks5://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo-feature-a',
      expect.objectContaining({
        timeoutMs: 120_000,
        signal,
        env: expect.objectContaining({ ALL_PROXY: 'socks5://127.0.0.1:7890' }),
      }),
      'pull',
      '--ff-only',
    )
  })

  test('pushBranch uses configured network options after resolving the push target', async () => {
    gitMock.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === 'remote' && args[1] === '-v') {
        return 'origin\thttps://example.com/acme/repo.git (fetch)\norigin\thttps://example.com/acme/repo.git (push)'
      }
      if (args[0] === 'config' && args[1] === '--get') throw new Error('no upstream')
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })
    const { pushBranch } = await import('#/system/git/remote.ts')

    await expect(
      pushBranch('/repo', 'feature/a', undefined, {
        timeoutMs: 180_000,
        proxyUrl: 'http://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({
        timeoutMs: 180_000,
        env: expect.objectContaining({ HTTPS_PROXY: 'http://127.0.0.1:7890' }),
      }),
      'push',
      '-u',
      '--',
      'origin',
      'feature/a:feature/a',
    )
  })
})
```

- [ ] **Step 5: Implement remote.ts signatures**

In `src/system/git/remote.ts`, import `gitNetworkOptions` and `type GitNetworkOptions` from helper.

Change signatures:

```ts
export async function fetchAll(
  cwd: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
```

```ts
export async function pullBranch(
  cwd: string,
  branch: string,
  worktreePath?: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
```

```ts
export async function pushBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
```

Replace every `{ timeoutMs: NETWORK_TIMEOUT_MS, signal }` in these three functions with:

```ts
gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal)
```

- [ ] **Step 6: Write clone option tests**

Create `src/system/git/clone.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})

describe('cloneRepository', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'cloned' })
  })

  test('uses configured git network timeout and proxy env', async () => {
    const { cloneRepository } = await import('#/system/git/clone.ts')
    const signal = new AbortController().signal

    await expect(
      cloneRepository('/repos', 'project', 'https://example.com/acme/project.git', signal, {
        timeoutMs: 240_000,
        proxyUrl: 'socks5://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'cloned', path: '/repos/project' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repos',
      expect.objectContaining({
        timeoutMs: 240_000,
        signal,
        env: expect.objectContaining({ ALL_PROXY: 'socks5://127.0.0.1:7890' }),
      }),
      'clone',
      '--',
      'https://example.com/acme/project.git',
      '/repos/project',
    )
  })
})
```

- [ ] **Step 7: Implement clone signature**

In `src/system/git/clone.ts`, import `gitNetworkOptions` and `type GitNetworkOptions`. Change the signature:

```ts
export async function cloneRepository(
  parentPath: string,
  directoryName: string,
  url: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult & { path?: string }> {
```

Replace clone options:

```ts
    gitNetworkOptions(networkOptions, CLONE_TIMEOUT_MS, signal),
```

- [ ] **Step 8: Run focused system Git tests**

Run:

```bash
bun run test -- src/system/git/helper-network.test.ts src/system/git/remote.test.ts src/system/git/clone.test.ts
```

Expected after implementation: PASS.

## Task 4: Thread Network Options Through Server Repo Writes

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`

- [ ] **Step 1: Add repo module test mock for settings source**

In `src/server/modules/repo.test.ts`, add to the hoisted `mocks` object:

```ts
  getServerSettingsPrefs: vi.fn(),
  cloneGitRepository: vi.fn(),
```

Add a mock for `src/system/git/clone.ts`:

```ts
vi.mock('#/system/git/clone.ts', () => ({
  cloneRepository: mocks.cloneGitRepository,
}))
```

Add a mock for settings source:

```ts
vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
}))
```

In `beforeEach()`, set:

```ts
  mocks.getServerSettingsPrefs.mockResolvedValue({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalApp: 'auto',
    editorApp: 'auto',
  })
  mocks.cloneGitRepository.mockResolvedValue({ ok: true, message: 'cloned', path: '/tmp/project' })
```

- [ ] **Step 2: Add server tests for local network options**

In `src/server/modules/repo.test.ts`, add:

```ts
describe('git network settings for local repository network operations', () => {
  test('fetchRepository passes configured network options to local fetch', async () => {
    mocks.fetchAll.mockResolvedValueOnce({ ok: true, message: 'fetched' })
    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepository('/tmp/repo', 'user')).resolves.toEqual({ ok: true, message: 'fetched' })

    expect(mocks.fetchAll).toHaveBeenCalledWith(
      '/tmp/repo',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('pullRepositoryBranch passes configured network options to local pull', async () => {
    const { pullRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(pullRepositoryBranch('/tmp/repo', 'feature/a')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.pullBranch).toHaveBeenCalledWith(
      '/tmp/repo',
      'feature/a',
      undefined,
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('pushRepositoryBranch passes configured network options to local push', async () => {
    const { pushRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(pushRepositoryBranch('/tmp/repo', 'feature/a')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.pushBranch).toHaveBeenCalledWith(
      '/tmp/repo',
      'feature/a',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('cloneRepository passes configured network options to local clone', async () => {
    const { cloneRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      cloneRepository('clone-1', 'https://example.com/acme/project.git', '/tmp', 'project'),
    ).resolves.toEqual({ ok: true, message: 'cloned', path: '/tmp/project' })

    expect(mocks.cloneGitRepository).toHaveBeenCalledWith(
      '/tmp',
      'project',
      'https://example.com/acme/project.git',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })
})
```

- [ ] **Step 3: Add server tests for remote backend ignore behavior**

Add:

```ts
describe('git network settings for SSH repository network operations', () => {
  test('remote fetch does not pass local git network options into SSH helper', async () => {
    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepository('ssh-config://prod/srv/repo', 'user')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.fetchRemoteRepository).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { signal: expect.any(AbortSignal) },
    )
  })
})
```

- [ ] **Step 4: Run repo module tests and confirm they fail**

Run:

```bash
bun run test -- src/server/modules/repo.test.ts
```

Expected before implementation: FAIL because server write paths and backend interfaces do not pass network options.

- [ ] **Step 5: Extend repo backend interface and local implementation**

In `src/server/modules/repo-backend.ts`, import the type:

```ts
import type { GitNetworkOptions } from '#/system/git/helper.ts'
```

Update `RepoBackend`:

```ts
  fetch(signal: AbortSignal, networkOptions?: GitNetworkOptions): Promise<{ ok: boolean; message: string }>
  pull(branch: string, worktreePath?: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
  push(branch: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
```

Update local backend methods:

```ts
    async fetch(signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const available = await probeGitRepository(repoId)
      if (!available.ok) return available
      return await fetchAll(repoId, signal, networkOptions)
    },
```

```ts
    async pull(branch, worktreePath, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await pullBranch(repoId, branch, worktreePath, signal, networkOptions)
    },
```

```ts
    async push(branch, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await pushBranch(repoId, branch, signal, networkOptions)
    },
```

Leave remote backend methods using only `{ signal }`:

```ts
    async fetch(signal) {
      return await fetchRemoteRepository(target, { signal })
    },
```

- [ ] **Step 6: Read settings and pass network options in repo write paths**

In `src/server/modules/repo-write-paths.ts`, import:

```ts
import { gitNetworkOptionsFromPrefs } from '#/server/modules/git-network-settings.ts'
```

Add helper:

```ts
async function getGitNetworkOptions() {
  return gitNetworkOptionsFromPrefs(await getServerSettingsPrefs())
}
```

In `cloneRepository()`, before calling `cloneGitRepository`, add:

```ts
  const networkOptions = await getGitNetworkOptions()
```

Then call:

```ts
    return await cloneGitRepository(targetParent, targetName, repoUrl, ctrl.signal, networkOptions)
```

In `fetchRepository()`, update `executeFetch()`:

```ts
  async function executeFetch(): Promise<{ ok: boolean; message: string }> {
    return await runWithRepoBackend(cwd, async (backend) => {
      const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
      return await runFetch((signal) => backend.fetch(signal, networkOptions))
    })
  }
```

In `pullRepositoryBranch()`:

```ts
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.pull(branch, worktreePath, mergedSignal, networkOptions)
  })
```

In `pushRepositoryBranch()`:

```ts
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.push(branch, mergedSignal, networkOptions)
  })
```

- [ ] **Step 7: Run repo module tests**

Run:

```bash
bun run test -- src/server/modules/repo.test.ts
```

Expected after implementation: PASS.

## Task 5: Add Web Settings Read/Write Paths

**Files:**
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-write-paths.test.ts`
- Modify: `src/web/settings-read-projection.ts`
- Create: `src/web/runtime-settings-git-network.ts`

- [ ] **Step 1: Write web settings write-path tests**

In `src/web/settings-write-paths.test.ts`, add mocks to `appDataClientMocks`:

```ts
  setGitNetworkProxyEnabled: vi.fn(async () => {}),
  setGitNetworkProxyUrl: vi.fn(async () => {}),
  setGitNetworkTimeoutSec: vi.fn(async () => {}),
```

Add them to `vi.mock('#/web/settings-client.ts', ...)`:

```ts
  setGitNetworkProxyEnabled: appDataClientMocks.setGitNetworkProxyEnabled,
  setGitNetworkProxyUrl: appDataClientMocks.setGitNetworkProxyUrl,
  setGitNetworkTimeoutSec: appDataClientMocks.setGitNetworkTimeoutSec,
```

Reset them in `beforeEach()`:

```ts
    appDataClientMocks.setGitNetworkProxyEnabled.mockReset()
    appDataClientMocks.setGitNetworkProxyEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setGitNetworkProxyUrl.mockReset()
    appDataClientMocks.setGitNetworkProxyUrl.mockResolvedValue(undefined)
    appDataClientMocks.setGitNetworkTimeoutSec.mockReset()
    appDataClientMocks.setGitNetworkTimeoutSec.mockResolvedValue(undefined)
```

Add tests:

```ts
  test('setGitNetworkProxyEnabledPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkProxyEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkProxyEnabledPreference(true)

    expect(appDataClientMocks.setGitNetworkProxyEnabled).toHaveBeenCalledWith(true)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkProxyEnabled: true,
    })
  })

  test('setGitNetworkProxyUrlPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkProxyUrlPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkProxyUrlPreference('socks5://127.0.0.1:7890')

    expect(appDataClientMocks.setGitNetworkProxyUrl).toHaveBeenCalledWith('socks5://127.0.0.1:7890')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('setGitNetworkTimeoutSecPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkTimeoutSecPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkTimeoutSecPreference(180)

    expect(appDataClientMocks.setGitNetworkTimeoutSec).toHaveBeenCalledWith(180)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkTimeoutSec: 180,
    })
  })
```

- [ ] **Step 2: Run web settings write-path tests and confirm they fail**

Run:

```bash
bun run test -- src/web/settings-write-paths.test.ts
```

Expected before implementation: FAIL because the web settings client/write helpers do not exist.

- [ ] **Step 3: Add web settings-client writers**

In `src/web/settings-client.ts`, add:

```ts
export async function setGitNetworkProxyEnabled(enabled: boolean): Promise<void> {
  await updateSettingsPrefsPatch({ gitNetworkProxyEnabled: enabled })
}

export async function setGitNetworkProxyUrl(url: string): Promise<void> {
  await updateSettingsPrefsPatch({ gitNetworkProxyUrl: url })
}

export async function setGitNetworkTimeoutSec(sec: number): Promise<void> {
  await updateSettingsPrefsPatch({ gitNetworkTimeoutSec: sec })
}
```

- [ ] **Step 4: Add web settings write-path helpers**

In `src/web/settings-write-paths.ts`, import the three client writers, then add:

```ts
export async function setGitNetworkProxyEnabledPreference(enabled: boolean): Promise<void> {
  await setGitNetworkProxyEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkProxyEnabled: enabled,
  }))
}

export async function setGitNetworkProxyUrlPreference(url: string): Promise<void> {
  await setGitNetworkProxyUrl(url)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkProxyUrl: url,
  }))
}

export async function setGitNetworkTimeoutSecPreference(sec: number): Promise<void> {
  await setGitNetworkTimeoutSec(sec)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkTimeoutSec: sec,
  }))
}
```

- [ ] **Step 5: Add runtime reader and controller**

In `src/web/settings-read-projection.ts`, add:

```ts
export function readRuntimeGitNetworkSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    gitNetworkProxyEnabled:
      data?.gitNetworkProxyEnabled ?? fallback?.gitNetworkProxyEnabled ?? false,
    gitNetworkProxyUrl:
      data?.gitNetworkProxyUrl ?? fallback?.gitNetworkProxyUrl ?? '',
    gitNetworkTimeoutSec:
      data?.gitNetworkTimeoutSec ?? fallback?.gitNetworkTimeoutSec ?? 120,
  }
}
```

Create `src/web/runtime-settings-git-network.ts`:

```ts
import {
  currentRuntimeSettingsSnapshot,
  readRuntimeGitNetworkSettings,
  useRuntimeSettingsSnapshot,
} from '#/web/settings-read-projection.ts'
import { runSettingsControllerAction } from '#/web/settings-write-paths.ts'
import {
  setGitNetworkProxyEnabledPreference,
  setGitNetworkProxyUrlPreference,
  setGitNetworkTimeoutSecPreference,
} from '#/web/settings-write-paths.ts'

export function getRuntimeGitNetworkSettings() {
  return readRuntimeGitNetworkSettings(currentRuntimeSettingsSnapshot())
}

export function useRuntimeGitNetworkSettings() {
  return readRuntimeGitNetworkSettings(useRuntimeSettingsSnapshot())
}

export function useGitNetworkSettingsController() {
  return {
    async setGitNetworkProxyEnabled(enabled: boolean): Promise<void> {
      await runSettingsControllerAction('git network proxy enabled update', async () => {
        await setGitNetworkProxyEnabledPreference(enabled)
      })
    },
    async setGitNetworkProxyUrl(url: string): Promise<void> {
      await runSettingsControllerAction('git network proxy url update', async () => {
        await setGitNetworkProxyUrlPreference(url)
      })
    },
    async setGitNetworkTimeoutSec(sec: number): Promise<void> {
      await runSettingsControllerAction('git network timeout update', async () => {
        await setGitNetworkTimeoutSecPreference(sec)
      })
    },
  }
}
```

- [ ] **Step 6: Run web settings write-path tests**

Run:

```bash
bun run test -- src/web/settings-write-paths.test.ts
```

Expected after implementation: PASS.

## Task 6: Add Settings > Proxy UI And Localized Copy

**Files:**
- Modify: `src/shared/settings-pages.ts`
- Create: `src/web/components/settings/pages/ProxySettings.tsx`
- Modify: `src/web/components/SettingsSurface.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Update test fixtures containing full bootstrap/settings snapshots.

- [ ] **Step 1: Write UI tests**

In `src/web/components/SettingsSurface.test.tsx`, add the new settings fields to every full `settings.get`, `initialSettings`, and `goblinNative.initialSettings` fixture:

```ts
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
```

Add tests:

```tsx
  test('renders the proxy settings page', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.proxy.title')
    expect(document.body.textContent).toContain('settings.proxy.git-proxy')
    expect(document.body.textContent).toContain('settings.proxy.git-timeout')
    expect(document.body.textContent).toContain('settings.proxy.ssh-note')
  })

  test('edits git network proxy settings from proxy settings', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    const enabledSwitch = switchById('settings-git-network-proxy-enabled')
    const urlInput = document.getElementById('settings-git-network-proxy-url')
    const timeoutInput = document.getElementById('settings-git-network-timeout-sec')
    if (!(urlInput instanceof HTMLInputElement)) throw new Error('Missing git network proxy url input')
    if (!(timeoutInput instanceof HTMLInputElement)) throw new Error('Missing git network timeout input')

    await act(async () => {
      enabledSwitch.click()
      setInputValue(urlInput, 'socks5://127.0.0.1:7890')
      setInputValue(timeoutInput, '180')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyEnabled === true
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyUrl === 'socks5://127.0.0.1:7890'
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkTimeoutSec === 180
      }),
    ).toBe(true)
  })
```

- [ ] **Step 2: Run UI tests and confirm they fail**

Run:

```bash
bun run test -- src/web/components/SettingsSurface.test.tsx
```

Expected before implementation: FAIL because the `proxy` settings page does not exist.

- [ ] **Step 3: Add settings page config**

In `src/shared/settings-pages.ts`, add `'proxy'` after `'sync'`:

```ts
  'proxy',
```

Add config:

```ts
  proxy: { titleKey: 'settings.proxy.title', labelKey: 'settings.nav.proxy' },
```

- [ ] **Step 4: Create ProxySettings page**

Create `src/web/components/settings/pages/ProxySettings.tsx`:

```tsx
import { SettingsCard, SettingsGroup, SettingsList, SettingsNumberInput, SettingsRow } from '#/web/components/settings/SettingsPrimitives.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { MAX_GIT_NETWORK_TIMEOUT_SEC, MIN_GIT_NETWORK_TIMEOUT_SEC } from '#/shared/settings.ts'
import { useGitNetworkSettingsController, useRuntimeGitNetworkSettings } from '#/web/runtime-settings-git-network.ts'
import { useT } from '#/web/stores/i18n.ts'

export function ProxySettings() {
  const t = useT()
  const {
    gitNetworkProxyEnabled,
    gitNetworkProxyUrl,
    gitNetworkTimeoutSec,
  } = useRuntimeGitNetworkSettings()
  const {
    setGitNetworkProxyEnabled,
    setGitNetworkProxyUrl,
    setGitNetworkTimeoutSec,
  } = useGitNetworkSettingsController()

  return (
    <SettingsGroup label={t('settings.proxy.git-title')} hint={t('settings.proxy.git-body')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-git-network-proxy-enabled"
          label={t('settings.proxy.git-proxy')}
          hint={t('settings.proxy.git-proxy-hint')}
          control={
            <Switch
              id="settings-git-network-proxy-enabled"
              checked={gitNetworkProxyEnabled}
              onCheckedChange={(checked) => void setGitNetworkProxyEnabled(checked)}
              aria-label={t('settings.proxy.git-proxy')}
            />
          }
        />
        <SettingsRow
          controlId="settings-git-network-proxy-url"
          label={t('settings.proxy.git-proxy-url')}
          hint={t('settings.proxy.git-proxy-url-hint')}
          control={
            <Input
              id="settings-git-network-proxy-url"
              value={gitNetworkProxyUrl}
              placeholder="socks5://127.0.0.1:7890"
              className="h-8 w-60 max-w-full px-2 text-xs"
              onChange={(event) => void setGitNetworkProxyUrl(event.currentTarget.value)}
            />
          }
        />
        <SettingsRow
          controlId="settings-git-network-timeout-sec"
          label={t('settings.proxy.git-timeout')}
          hint={t('settings.proxy.git-timeout-hint')}
          control={
            <div className="flex items-center justify-end gap-2">
              <SettingsNumberInput
                id="settings-git-network-timeout-sec"
                value={gitNetworkTimeoutSec}
                min={MIN_GIT_NETWORK_TIMEOUT_SEC}
                max={MAX_GIT_NETWORK_TIMEOUT_SEC}
                step={1}
                onChange={(value) => void setGitNetworkTimeoutSec(value)}
              />
              <span className="text-xs text-muted-foreground">{t('settings.proxy.seconds')}</span>
            </div>
          }
        />
      </SettingsList>
      <SettingsCard className="px-4 py-3 text-[11px] leading-snug text-muted-foreground">
        {t('settings.proxy.ssh-note')}
      </SettingsCard>
    </SettingsGroup>
  )
}
```

- [ ] **Step 5: Render page in SettingsSurface**

In `src/web/components/SettingsSurface.tsx`, import:

```tsx
import { ProxySettings } from '#/web/components/settings/pages/ProxySettings.tsx'
```

Render:

```tsx
        {page === 'proxy' && <ProxySettings />}
```

- [ ] **Step 6: Add i18n keys**

Add these keys to `src/shared/i18n/en.ts`:

```ts
  'settings.nav.proxy': 'Proxy',
  'settings.proxy.title': 'Proxy',
  'settings.proxy.git-title': 'Git network',
  'settings.proxy.git-body': 'Configure proxy and timeout for local Git network operations.',
  'settings.proxy.git-proxy': 'Git network proxy',
  'settings.proxy.git-proxy-hint': 'Applies only to local repository fetch, pull, push, and clone.',
  'settings.proxy.git-proxy-url': 'Proxy URL',
  'settings.proxy.git-proxy-url-hint': 'Supports http://, https://, and socks5:// URLs.',
  'settings.proxy.git-timeout': 'Git network timeout',
  'settings.proxy.git-timeout-hint': 'Cancels the Git child process when the timeout is reached.',
  'settings.proxy.seconds': 'sec',
  'settings.proxy.ssh-note': 'SSH remote repositories are not proxied by this setting. Use ~/.ssh/config with ProxyCommand or ProxyJump for SSH remotes.',
```

Add equivalent keys to `src/shared/i18n/zh.ts`:

```ts
  'settings.nav.proxy': '代理',
  'settings.proxy.title': '代理',
  'settings.proxy.git-title': 'Git 网络',
  'settings.proxy.git-body': '配置本地 Git 网络操作的代理和超时。',
  'settings.proxy.git-proxy': 'Git 网络代理',
  'settings.proxy.git-proxy-hint': '仅作用于本地仓库的 fetch、pull、push、clone。',
  'settings.proxy.git-proxy-url': '代理 URL',
  'settings.proxy.git-proxy-url-hint': '支持 http://、https:// 和 socks5:// URL。',
  'settings.proxy.git-timeout': 'Git 网络超时',
  'settings.proxy.git-timeout-hint': '到达超时时取消当前 Git 子进程。',
  'settings.proxy.seconds': '秒',
  'settings.proxy.ssh-note': 'SSH 远程仓库不受此设置代理。SSH remote 请继续通过 ~/.ssh/config 的 ProxyCommand 或 ProxyJump 配置。',
```

Add Korean and Japanese translations with the same keys. Keep placeholders and tags aligned with English; these strings have no placeholders.

- [ ] **Step 7: Run UI and i18n tests**

Run:

```bash
bun run test -- src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected after implementation: PASS.

## Task 7: Update Full Settings Fixtures And Run Verification

**Files:**
- Modify any test fixture that fails typecheck because it constructs a complete `InitialSettingsSnapshot`, `SettingsPrefs`, or settings response.

- [ ] **Step 1: Run typecheck to find fixture gaps**

Run:

```bash
bun run typecheck
```

Expected before fixture cleanup: possible FAIL in tests or bootstrap fixtures that construct full settings objects without the new fields.

- [ ] **Step 2: Add the new fields to complete settings fixtures**

For every failing complete settings fixture, add:

```ts
gitNetworkProxyEnabled: false,
gitNetworkProxyUrl: '',
gitNetworkTimeoutSec: 120,
```

Common files likely to need updates based on existing full fixtures:

- `src/main/preload.test.ts`
- `src/main/rpc.test.ts`
- `src/server/app-factory.test.ts`
- `src/server/modules/settings-write-paths.test.ts`
- `src/server/modules/settings.test.ts`
- `src/server/modules/remote.test.ts`
- `src/web/bootstrap.test.ts`
- `src/web/stores/bootstrap-seed.test.ts`
- `src/web/runtime-settings-hooks.test.tsx`
- `src/web/settings-client.test.ts`
- `src/web/components/SettingsSurface.test.tsx`
- Any other file reported by `bun run typecheck`

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/git-network-settings.test.ts src/system/git/helper-network.test.ts src/system/git/remote.test.ts src/system/git/clone.test.ts src/server/modules/repo.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run standard verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all PASS.

## Implementation Notes

- Do not use TypeScript enums for proxy protocol handling. Use string comparisons on `URL.protocol`.
- Keep the proxy setting command-scoped. Only pass `env` to the `execa('git', ...)` call for the current command.
- Do not clear inherited proxy environment variables when Hobgoblin proxy is disabled. The design preserves the app process environment in that case.
- Do not pass local proxy settings into `runRemoteCommand()` or any `src/system/ssh/*` command.
- Keep UI dense and settings-native. Do not add a landing page, modal, wizard, or decorative explanation.
- Keep the timeout unit in seconds in settings and milliseconds in Git helper options.
