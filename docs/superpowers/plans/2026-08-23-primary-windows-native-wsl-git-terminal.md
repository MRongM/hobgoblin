# Primary Windows Native/WSL Git And Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the primary application Windows version reliably discover and run Git for Windows, enter local Windows projects correctly from WSL terminals, and apply existing Git network settings to WSL projects without changing SSH behavior.

**Architecture:** Keep Git process policy in `src/system/git/**`, WSL process construction in the existing Windows/remote system boundaries, and project routing in the server repository backend. Preserve the current worker-backed terminal runtime and opaque WSL project identity; add only narrow adapters for executable resolution, `wsl.exe` arguments, and WSL environment forwarding.

**Tech Stack:** TypeScript 6 strip-only mode, Bun, Execa 9, node-pty 1.1, Vitest 4, Electron 42, Git for Windows, WSL 2.

## Global Constraints

- Target only the primary application root `src/` tree; do not modify `windows/`.
- Windows local projects keep native Git for application-owned operations even when their internal shell is WSL.
- WSL projects execute Git and terminals inside their registered distribution and Linux path.
- SSH projects must not receive the local Git proxy or timeout preference.
- Keep the existing worker-backed terminal host and server-owned session model.
- Do not add dependencies, settings, re-export shims, credential storage, or Askpass integration.
- Use repo-alias imports with explicit `.ts` extensions and strip-only-safe TypeScript.
- Pass executable paths, working directories, and proxy transport structurally; never interpolate Windows paths or proxy values into shell command strings.
- Tests use generic placeholder paths and hosts.
- Do not create a branch, worktree, commit, or push without separate user authorization.

---

### Task 1: Resolve And Run Git For Windows Deterministically

**Files:**

- Create: `src/system/git/executable.ts`
- Create: `src/system/git/executable.test.ts`
- Modify: `src/system/git/helper.ts`
- Modify: `src/system/git/helper-network.test.ts`

**Interfaces:**

- Produces: `resolveGitExecutable(options?): string | null`.
- Consumes: `git()` and `checkGitAvailable()` continue exposing their existing public contracts.
- Test seam: executable resolution and the arguments/options passed by public `git()` to Execa.

- [x] **Step 1: Write the failing Windows executable resolver tests**

Create cases that independently prove known-directory order, `PATH` fallback, case-insensitive environment lookup, deduplication, non-Windows fallback, and rejection of relative/current-directory candidates:

```ts
expect(
  resolveGitExecutable({
    platform: 'win32',
    env: {
      ProgramW6432: 'C:\\Program Files',
      LocalAppData: 'C:\\Users\\dev\\AppData\\Local',
      PATH: '.;C:\\Tools\\Git\\cmd',
    },
    fileExists: existingFiles('C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Tools\\Git\\cmd\\git.exe'),
  }),
).toBe('C:\\Program Files\\Git\\cmd\\git.exe')
```

- [x] **Step 2: Run the resolver test and observe RED**

Run:

```bash
bun run test src/system/git/executable.test.ts
```

Expected: FAIL because `src/system/git/executable.ts` does not exist.

- [x] **Step 3: Implement the focused resolver**

Implement this public shape without caching or filesystem traversal:

```ts
interface ResolveGitExecutableOptions {
  platform?: NodeJS.Platform | string
  env?: NodeJS.ProcessEnv
  fileExists?: (filePath: string) => boolean
}

export function resolveGitExecutable(options: ResolveGitExecutableOptions = {}): string | null
```

On `win32`, construct exact `Git/cmd/git.exe` candidates from `PROGRAMW6432`, `PROGRAMFILES(X86)`, `PROGRAMFILES`, and `LOCALAPPDATA/Programs`, followed by absolute `PATH` directories. Normalize and deduplicate case-insensitively. On other platforms return `git`.

- [x] **Step 4: Run the resolver test and observe GREEN**

Run the Step 2 command. Expected: all resolver cases pass.

- [x] **Step 5: Write the failing Git child-environment test**

Extend `helper-network.test.ts` to assert that public `git()` selects the resolver output and combines proxy variables with deterministic Git output variables:

```ts
expect(execaMock).toHaveBeenCalledWith(
  'C:\\Program Files\\Git\\cmd\\git.exe',
  ['fetch'],
  expect.objectContaining({
    env: expect.objectContaining({
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      LANGUAGE: 'en',
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8',
      GIT_PAGER: 'cat',
    }),
  }),
)
```

Mock `resolveGitExecutable()` at its module boundary so this test observes `git()` rather than resolver internals.

- [x] **Step 6: Run the helper test and observe RED**

Run:

```bash
bun run test src/system/git/helper-network.test.ts
```

Expected: FAIL because `git()` still invokes bare `git` and does not add the stable environment.

- [x] **Step 7: Route every Git command through the resolver**

In `helper.ts`, resolve the executable immediately before Execa. When the resolver returns `null`, reject with an `Error` carrying `code: 'ENOENT'` so `checkGitAvailable()` retains `error.git-not-found`. Pass this environment:

```ts
env: {
  ...(opts?.env ?? {}),
  LANGUAGE: 'en',
  LC_ALL: 'en_US.UTF-8',
  LANG: 'en_US.UTF-8',
  GIT_PAGER: 'cat',
}
```

Do not set `GIT_TERMINAL_PROMPT` or mutate `process.env`.

- [x] **Step 8: Run focused Git tests and observe GREEN**

Run:

```bash
bun run test src/system/git/executable.test.ts src/system/git/helper.test.ts src/system/git/helper-network.test.ts
```

Expected: all tests pass.

---

### Task 2: Make WSL Discovery And Local Terminal CWD Explicit

**Files:**

- Modify: `src/shared/windows-wsl.ts`
- Modify: `src/system/wsl/distributions.ts`
- Create: `src/system/wsl/distributions.test.ts`
- Modify: `src/server/terminal/windows-terminal-shell.ts`
- Modify: `src/server/terminal/windows-terminal-shell.test.ts`
- Modify: `src/server/terminal/terminal-pty-runtime.ts`
- Modify: `src/server/terminal/terminal-pty-runtime.test.ts`

**Interfaces:**

- Preserves: `resolveUsableWindowsWslExecutable()` and `listWindowsWslDistributions()`.
- Extends: `resolveWindowsTerminalShellCandidates({ cwd? })` with an optional structured Windows working directory.
- Test seams: public WSL distribution listing, public shell candidate resolution, and public PTY spawn.

- [x] **Step 1: Write failing UTF-16LE WSL enumeration tests**

Assert both the synchronous capability probe and asynchronous distribution list force the WSL output contract:

```ts
expect(execaMock).toHaveBeenCalledWith(
  'C:\\Windows\\System32\\wsl.exe',
  ['--list', '--quiet'],
  expect.objectContaining({
    encoding: 'utf16le',
    env: expect.objectContaining({ WSL_UTF8: '0' }),
  }),
)
```

Return `Ubuntu-24.04\r\n开发环境\r\n` and expect the two exact distribution names.

- [x] **Step 2: Run WSL discovery tests and observe RED**

Run:

```bash
bun run test src/system/wsl/distributions.test.ts src/server/terminal/windows-terminal-shell.test.ts
```

Expected: FAIL because the current probes request UTF-8 and do not force `WSL_UTF8=0`.

- [x] **Step 3: Apply the explicit WSL output contract**

For both probes, use `encoding: 'utf16le'` and `env: { ...env, WSL_UTF8: '0' }` (or `process.env` in the asynchronous system function). Retain the five-second timeout, hidden window, cancellation, deduplication, and empty-result behavior.

- [x] **Step 4: Run WSL discovery tests and observe GREEN**

Run the Step 2 command. Expected: all discovery cases pass.

- [x] **Step 5: Write failing WSL working-directory candidate tests**

Add these behavioral expectations:

```ts
expect(resolveWindowsTerminalShellCandidates({ cwd: 'C:\\src\\repo', env, fileExists })[0]).toEqual({
  kind: 'wsl',
  command: 'C:\\Windows\\System32\\wsl.exe',
  args: ['--cd', 'C:\\src\\repo'],
})

expect(resolveWindowsTerminalShellCandidates({ cwd: '\\\\server\\share\\repo', env, fileExists })).not.toContainEqual(
  expect.objectContaining({ kind: 'wsl' }),
)
```

Update the PTY test to require `resolveWindowsTerminalShellCandidates({ cwd: 'C:\\repo' })`.

- [x] **Step 6: Run terminal tests and observe RED**

Run:

```bash
bun run test src/server/terminal/windows-terminal-shell.test.ts src/server/terminal/terminal-pty-runtime.test.ts
```

Expected: FAIL because the resolver currently returns an argument-free WSL candidate and the PTY runtime does not pass its `cwd` to the resolver.

- [x] **Step 7: Add structured WSL `--cd` behavior**

Import `pathStyle()` from `#/shared/path-semantics.ts`. Include WSL only when `cwd` is absent or is a Windows drive absolute path. When it is a drive path, use:

```ts
;['--cd', path.win32.normalize(cwd)]
```

When `cwd` is UNC or another non-drive style, omit WSL and retain native fallbacks. Pass `input.cwd` from `terminal-pty-runtime.ts` into the resolver. Keep node-pty's structured `cwd` option unchanged.

- [x] **Step 8: Run focused terminal tests and observe GREEN**

Run the Step 6 command plus:

```bash
bun run test src/server/terminal/terminal.test.ts src/server/terminal/terminal-worker-host.test.ts
```

Expected: all tests pass.

---

### Task 3: Apply Git Proxy And Timeout Settings To WSL Projects Only

**Files:**

- Modify: `src/system/ssh/commands.ts`
- Create: `src/system/ssh/commands-network.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

**Interfaces:**

- Extends: `RemoteCommandOptions` with `wslEnvironment?: Record<string, string>`.
- Extends: WSL-capable Git network helper option objects with `networkOptions?: GitNetworkOptions`.
- Preserves: SSH command argv, environment, and timeout behavior when no WSL transport is selected.
- Test seams: public `runRemoteCommand()`, public remote Git helpers, and public repository write paths.

- [x] **Step 1: Write failing WSL environment-forwarding tests**

In `commands-network.test.ts`, mock Execa and call public `runRemoteCommand()` for one WSL and one SSH target. With inherited `WSLENV=EXISTING/u` and:

```ts
wslEnvironment: {
  HTTP_PROXY: 'http://127.0.0.1:7890',
  HTTPS_PROXY: 'http://127.0.0.1:7890',
}
```

assert the WSL Execa call contains those values and:

```text
EXISTING/u:HTTP_PROXY:HTTPS_PROXY
```

Assert the SSH Execa call has no proxy environment or `WSLENV` modification.

- [x] **Step 2: Run the command test and observe RED**

Run:

```bash
bun run test src/system/ssh/commands-network.test.ts
```

Expected: FAIL because `RemoteCommandOptions` cannot forward WSL environment values.

- [x] **Step 3: Implement safe `WSLENV` merging**

In `runRemoteCommand()`, apply `wslEnvironment` only when `target.transport === 'wsl'`. Preserve inherited colon-separated entries and optional `/p`, `/l`, `/u`, or `/w` flags; deduplicate new names case-insensitively using the name before `/`. Pass the merged environment only through Execa options. Never add it to the generated shell script or SSH process.

- [x] **Step 4: Run the command test and observe GREEN**

Run the Step 2 command. Expected: both WSL forwarding and SSH isolation pass.

- [x] **Step 5: Write failing remote Git network-option tests**

Use an injected `RemoteGitRunner` to capture public helper options. For a WSL target:

```ts
await fetchRemoteRepositoryByName(WSL_TARGET, 'origin', {
  networkOptions: { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
  run,
})
```

Expect the actual `gitFetchRemote` call to carry `timeoutMs: 240_000` and the environment returned by `buildGitNetworkEnv()`. Repeat one case with an SSH target and assert its existing timeout remains unchanged and no `wslEnvironment` is present.

- [x] **Step 6: Run the remote Git tests and observe RED**

Run:

```bash
bun run test src/system/ssh/git.test.ts
```

Expected: FAIL because WSL Git helpers do not accept or translate `GitNetworkOptions`.

- [x] **Step 7: Thread network options through WSL Git commands**

Add a focused helper in `ssh/git.ts`:

```ts
function remoteGitNetworkCommandOptions(
  target: RemoteRepoTarget,
  base: RemoteCommandOptions,
  networkOptions?: GitNetworkOptions,
): RemoteCommandOptions
```

Return `base` unchanged for SSH or missing options. For WSL, override `timeoutMs` with `networkOptions.timeoutMs` and add `wslEnvironment` only when `buildGitNetworkEnv(networkOptions.proxyUrl)` returns values. Apply it to fetch, named fetch, pull, push, exact worktree-head push, remote tag discovery, remote branch/tag deletion, and local-tag push.

- [x] **Step 8: Run the remote Git tests and observe GREEN**

Run the Step 6 command. Expected: all existing SSH tests and new WSL cases pass.

- [x] **Step 9: Write failing repository-routing tests**

Keep the current SSH assertions and add a WSL fetch assertion proving the configured object reaches `fetchRemoteRepository()`:

```ts
expect(mocks.fetchRemoteRepository).toHaveBeenCalledWith(
  expect.objectContaining({ transport: 'wsl', alias: 'Ubuntu-24.04', remotePath: '/srv/repo' }),
  {
    signal: expect.any(AbortSignal),
    networkOptions: { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
  },
)
```

Mock WSL capability and distribution resolution through their existing module boundaries. Do not replace `wsl://` parsing with a test-only path.

- [x] **Step 10: Run repository tests and observe RED**

Run:

```bash
bun run test src/server/modules/repo.test.ts
```

Expected: FAIL because server write paths currently load Git network settings only for `backend.kind === 'local'`.

- [x] **Step 11: Route settings to local and WSL backends without duplication**

In `repo-write-paths.ts`, replace repeated local-only ternaries with one helper that returns settings when the backend is local or when `parseRemoteRepoId(backend.id)?.transport === 'wsl'`; return `undefined` for SSH. Update remote backend network methods to pass their received `networkOptions` into the corresponding system Git helper. Preserve method signatures and unrelated repository behavior.

- [x] **Step 12: Update settings copy to match behavior**

Change only the existing Git proxy description/hint strings in English, Simplified Chinese, Korean, and Japanese so they say the preference applies to local and WSL repository network operations. Do not add new keys or settings controls.

- [x] **Step 13: Run the complete Task 3 focused suite and observe GREEN**

Run:

```bash
bun run test \
  src/system/git/helper-network.test.ts \
  src/system/ssh/commands-network.test.ts \
  src/system/ssh/commands.test.ts \
  src/system/ssh/git.test.ts \
  src/server/modules/git-network-settings.test.ts \
  src/server/modules/repo.test.ts
```

Expected: all tests pass and existing SSH assertions remain unchanged.

---

### Task 4: Documentation, Full Verification, And Review

**Files:**

- Modify: `CONTEXT.md`
- Verify: every file changed in Tasks 1–3
- Verify: `docs/superpowers/specs/2026-08-23-primary-windows-native-wsl-git-terminal-design.md`
- Verify: `docs/superpowers/plans/2026-08-23-primary-windows-native-wsl-git-terminal.md`

**Interfaces:**

- Consumes: all preceding task results.
- Produces: locally verified, review-ready changes with no commit or push.

- [x] **Step 1: Update only resolved domain language**

Retain the confirmed primary Windows target and Windows project Git execution boundary already recorded in `CONTEXT.md`. Add one concise WSL Git network sentence only if the implementation makes the existing `WSL project` definition incomplete; do not add implementation mechanisms such as `WSLENV` to the glossary.

- [x] **Step 2: Format-check task-owned files**

Run Prettier check against every changed TypeScript/Markdown file. If a task-owned file fails, run Prettier write on that explicit file list only, then repeat the check.

- [x] **Step 3: Run required repository verification**

Run in this order:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit zero.

Result on 2026-08-23: typecheck and architecture checks passed. After correcting two stale test contracts discovered by the full run, all 418 test files passed with 4354 tests passing and one Windows-only PowerShell installer integration test skipped on macOS. That test remains executable on Windows through `test.runIf(process.platform === 'win32')`.

- [x] **Step 4: Inspect the complete uncommitted diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff
```

Confirm only the agreed primary Windows/WSL scope and documentation are present. Do not include `tmp/vscode` because it is ignored research input.

- [x] **Step 5: Perform inline two-axis review**

Review the uncommitted diff against:

- Standards: `AGENTS.md`, `CONTEXT.md`, `docs/arch.md`, `docs/layering.md`, TypeScript strip-only constraints, and the code-smell baseline.
- Spec: `docs/superpowers/specs/2026-08-23-primary-windows-native-wsl-git-terminal-design.md`.

Fix every high-confidence finding, rerun the smallest affected tests, and rerun typecheck and architecture checks after review changes.

- [x] **Step 6: Report macOS verification and deferred Windows proof separately**

Report the exact local commands and results. Keep the following actions pending for final user confirmation because they require external state or dangerous operations:

- staging and committing task-owned files;
- pushing the branch;
- dispatching or observing a Windows workflow;
- performing manual Git for Windows, WSL, and ConPTY acceptance on Windows 11;
- deciding whether to design a later IPC Askpass phase.
