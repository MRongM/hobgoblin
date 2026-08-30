# Selectable Windows Internal Terminal Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted Windows internal-terminal shell selector with Automatic, WSL, PowerShell, and Command Prompt choices while keeping server-owned settings and the existing worker-backed terminal architecture.

**Architecture:** Store `windowsInternalTerminalShell` in the existing server settings slice and project it through the existing query-backed renderer settings flow. Configure the terminal worker from the parent server through a server-only protocol message; let `TerminalSessionManager` apply the current preference only when it spawns or restarts an ordinary local Windows shell, and reuse the existing safe candidate resolver for all fallback behavior.

**Tech Stack:** TypeScript 6 strip-only mode, Bun 1.3, Node.js 24, React 19, TanStack Query, Hono, node-pty 1.1, Vitest 4, Electron 42.

**Spec:** `docs/superpowers/specs/2026-08-30-selectable-windows-internal-terminal-shell-design.md`

## Global Constraints

- Target only the primary application root `src/` tree; do not modify `windows/`.
- Default and invalid persisted values resolve to `auto`.
- Automatic mode keeps WSL → PowerShell 7 → Windows PowerShell → Command Prompt fallback.
- Explicit WSL and Command Prompt never cross shell types; explicit PowerShell falls back only within the PowerShell family.
- WSL projects, SSH projects, explicit tmux launches, and trusted explicit terminal commands remain unchanged.
- Running terminals remain untouched; new and restarted terminals use the latest server-owned preference.
- Renderer requests cannot choose or override the worker shell policy.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and strip-only-safe TypeScript.
- Add no dependencies and no re-export shims.
- Keep fixtures, paths, and documentation privacy-safe.
- Do not create a branch, worktree, commit, or push without separate user authorization.

---

### Task 1: Persist And Project The Shell Preference

**Files:**

- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-defaults.test.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/settings-snapshot.test.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Create: `src/server/modules/settings-source-concurrency.test.ts`

**Interfaces:**

- Produces: `WindowsInternalTerminalShellPref = 'auto' | 'wsl' | 'powershell' | 'cmd'`.
- Produces: `normalizeWindowsInternalTerminalShellPref(value): WindowsInternalTerminalShellPref`.
- Produces: `DEFAULT_WINDOWS_INTERNAL_TERMINAL_SHELL` with value `auto`.
- Extends: `SettingsPrefs.windowsInternalTerminalShell` and `InitialSettingsSnapshot.windowsInternalTerminalShell`.
- Produces: `readPersistedWindowsInternalTerminalShellPref(): WindowsInternalTerminalShellPref` for synchronous server startup configuration.

- [x] **Step 1: Write failing settings model and persistence tests**

Add literal assertions showing the default, override, snapshot projection, legacy fallback, invalid fallback, four persisted values, and synchronous startup read:

```ts
expect(defaultSettingsPrefs().windowsInternalTerminalShell).toBe('auto')
expect(defaultSettingsPrefs({ windowsInternalTerminalShell: 'cmd' }).windowsInternalTerminalShell).toBe('cmd')
await expect(mod.updateServerSettingsPrefs({ windowsInternalTerminalShell: 'powershell' })).resolves.toMatchObject({
  windowsInternalTerminalShell: 'powershell',
})
expect(mod.readPersistedWindowsInternalTerminalShellPref()).toBe('powershell')
```

- [x] **Step 2: Run the focused tests and observe RED**

Run:

```bash
bun run test src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/settings-source-concurrency.test.ts
```

Expected: FAIL because the new type, property, default, projection, and persistence path do not exist.

- [x] **Step 3: Implement the minimal settings model**

Add the type and normalizer in `settings.ts`:

```ts
export type WindowsInternalTerminalShellPref = 'auto' | 'wsl' | 'powershell' | 'cmd'

export function normalizeWindowsInternalTerminalShellPref(value: unknown): WindowsInternalTerminalShellPref {
  return value === 'wsl' || value === 'powershell' || value === 'cmd' ? value : 'auto'
}
```

Thread `windowsInternalTerminalShell` through `SettingsPrefs`, defaults, initial bootstrap settings, runtime settings snapshot builders, `ServerSettingsData`, persisted-file normalization, write comparison/assignment, and public settings projection. Implement the synchronous startup reader by reading only `server-settings.json`, parsing this one property, and applying the shared normalizer; return `auto` on missing, malformed, or unreadable data.

- [x] **Step 4: Run focused settings tests and observe GREEN**

Run the Step 2 command. Expected: all focused settings tests pass.

---

### Task 2: Filter Safe Windows Shell Candidates

**Files:**

- Modify: `src/server/terminal/windows-terminal-shell.ts`
- Modify: `src/server/terminal/windows-terminal-shell.test.ts`
- Modify: `src/server/terminal/terminal-pty-runtime.ts`
- Modify: `src/server/terminal/terminal-pty-runtime.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Extends: `resolveWindowsTerminalShellCandidates({ preference? })`.
- Extends: `SpawnTerminalPtyRuntimeInput.windowsInternalTerminalShell?`.
- Preserves: trusted `command` and `args` take precedence over platform shell selection.

- [x] **Step 1: Write failing candidate-policy tests**

Add table-driven resolver cases with hand-derived candidate kinds:

```ts
expect(
  resolveWindowsTerminalShellCandidates({ preference: 'wsl', cwd, env, fileExists }).map(({ kind }) => kind),
).toEqual(['wsl'])
expect(
  resolveWindowsTerminalShellCandidates({ preference: 'powershell', cwd, env, fileExists }).map(({ kind }) => kind),
).toEqual(['powershell-core', 'windows-powershell'])
expect(
  resolveWindowsTerminalShellCandidates({ preference: 'cmd', cwd, env, fileExists }).map(({ kind }) => kind),
).toEqual(['cmd'])
```

Also assert that explicit WSL on a UNC `cwd` produces no candidates and that omitting the preference preserves the complete existing automatic order.

- [x] **Step 2: Run the resolver test and observe RED**

Run:

```bash
bun run test src/server/terminal/windows-terminal-shell.test.ts
```

Expected: FAIL because `preference` is ignored.

- [x] **Step 3: Implement candidate filtering**

Use the selected preference to decide which existing candidate families are probed and appended:

```ts
const includeWsl = preference === 'auto' || preference === 'wsl'
const includePowerShell = preference === 'auto' || preference === 'powershell'
const includeCmd = preference === 'auto' || preference === 'cmd'
```

Do not add executable locations or change validation, deduplication, WSL usability, drive-path `--cd`, or UNC behavior.

- [x] **Step 4: Run the resolver test and observe GREEN**

Run the Step 2 command. Expected: all resolver tests pass.

- [x] **Step 5: Write failing PTY error and precedence tests**

Prove the PTY runtime forwards the preference to automatic Windows resolution, returns `error.windows-internal-terminal-<kind>-unavailable` when an explicit selection has no candidate, and ignores the preference when a trusted command is present.

- [x] **Step 6: Run the PTY test and observe RED**

Run:

```bash
bun run test src/server/terminal/terminal-pty-runtime.test.ts
```

Expected: FAIL because the PTY input has no preference and unavailable errors are not selection-specific.

- [x] **Step 7: Implement PTY preference forwarding and localized errors**

Pass the normalized preference only to the Windows default-shell resolver. Keep `input.command` as the first and exclusive path. Return these keys only when no candidate exists for an explicit selection:

```ts
error.windows - internal - terminal - wsl - unavailable
error.windows - internal - terminal - powershell - unavailable
error.windows - internal - terminal - cmd - unavailable
```

Add accurate English, Simplified Chinese, Japanese, and Korean translations.

- [x] **Step 8: Run focused terminal resolver tests and observe GREEN**

Run:

```bash
bun run test src/server/terminal/windows-terminal-shell.test.ts src/server/terminal/terminal-pty-runtime.test.ts
```

Expected: all focused resolver and PTY tests pass.

---

### Task 3: Configure The Worker From Server-Owned Settings

**Files:**

- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/terminal/terminal-worker-protocol.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`
- Modify: `src/server/terminal/terminal-worker-host.test.ts`
- Modify: `src/server/terminal/terminal-worker-runtime.ts`
- Modify: `src/server/terminal/terminal-worker-runtime.test.ts`
- Modify: `src/server/terminal/terminal-facade.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Create: `src/server/terminal/terminal-session-manager-shell-preference.test.ts`
- Modify: `src/server/runtime.ts`
- Modify: `src/server/runtime.test.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/server/routes/settings.ts`
- Modify: `src/server/routes/settings.test.ts`

**Interfaces:**

- Extends: `ServerTerminalHost.setWindowsInternalTerminalShellPreference?(preference): void`.
- Adds: worker message `{ type: 'configure'; windowsInternalTerminalShell: WindowsInternalTerminalShellPref }`.
- Adds: `TerminalFacade.configure(input): void` and `configureServerTerminal(input): void`.
- Adds: `TerminalSessionManager.setWindowsInternalTerminalShellPreference(preference): void`.

- [x] **Step 1: Write failing worker configuration tests**

Prove a newly spawned worker receives normalized configuration before socket registration or a request, a live worker receives a later update, and a restarted worker receives the latest value first:

```ts
const host = new WorkerBackedTerminalHost({
  spawnWorker: () => worker as never,
  windowsInternalTerminalShell: 'powershell',
})
host.registerSocket('client_1', 'attachment_a', socket)
expect(worker.sent.slice(0, 2)).toEqual([
  { type: 'configure', windowsInternalTerminalShell: 'powershell' },
  expect.objectContaining({ type: 'socket-register' }),
])
```

Add a worker-runtime test proving the configuration message calls the real facade boundary before any request dispatch.

- [x] **Step 2: Run worker tests and observe RED**

Run:

```bash
bun run test src/server/terminal/terminal-worker-host.test.ts src/server/terminal/terminal-worker-runtime.test.ts
```

Expected: FAIL because the protocol and configuration methods do not exist.

- [x] **Step 3: Implement the server-only worker configuration path**

Store a normalized preference in `WorkerBackedTerminalHost`. Send it synchronously as the first IPC message for each spawned worker and whenever the setter changes it. Dispatch the new protocol message in `TerminalWorkerRuntime`, map it through `TerminalFacade`, and update the singleton `TerminalSessionManager` through `configureServerTerminal`.

Do not add the preference to `TerminalCreateInput`, `TerminalRestartInput`, or any renderer-controlled schema.

- [x] **Step 4: Run worker tests and observe GREEN**

Run the Step 2 command. Expected: all worker host and runtime tests pass.

- [x] **Step 5: Write failing session launch-timing tests**

Mock only `spawnTerminalPtyRuntime` and assert the manager's observable spawn input. Prove a newly configured manager uses the preference, changing it does not respawn an open session, and restart uses the new preference:

```ts
manager.setWindowsInternalTerminalShellPreference('wsl')
manager.ensureSession(input)
expect(spawnTerminalPtyRuntimeMock).toHaveBeenLastCalledWith(
  expect.objectContaining({ windowsInternalTerminalShell: 'wsl' }),
)
manager.setWindowsInternalTerminalShellPreference('cmd')
expect(spawnTerminalPtyRuntimeMock).toHaveBeenCalledTimes(1)
manager.restartSession(ownerId, sessionId, 80, 24, attachmentId, true)
expect(spawnTerminalPtyRuntimeMock).toHaveBeenLastCalledWith(
  expect.objectContaining({ windowsInternalTerminalShell: 'cmd' }),
)
```

- [x] **Step 6: Run the session-manager test and observe RED**

Run:

```bash
bun run test src/server/terminal/terminal-session-manager-shell-preference.test.ts
```

Expected: FAIL because the manager has no configurable preference and spawn input does not carry it.

- [x] **Step 7: Apply the preference at PTY spawn time**

Keep the normalized preference as manager state with default `auto`. Add it to every `spawnTerminalPtyRuntime` call; because trusted commands retain precedence in Task 2, remote and tmux invocations stay unchanged. Do not store it in session snapshots or mutate a running PTY.

- [x] **Step 8: Run the session-manager test and observe GREEN**

Run the Step 6 command. Expected: all session-manager tests pass.

- [x] **Step 9: Write failing server startup and settings-update tests**

Prove `createServerRuntime` initializes a provided configurable host from `readPersistedWindowsInternalTerminalShellPref()`, and prove `POST /api/settings/prefs` configures the host with the normalized setting after persistence.

- [x] **Step 10: Run server integration tests and observe RED**

Run:

```bash
bun run test src/server/runtime.test.ts src/server/routes/settings.test.ts
```

Expected: FAIL because runtime startup and settings writes do not configure the terminal host.

- [x] **Step 11: Wire startup and live settings updates**

Initialize the terminal host synchronously from the settings source in `createServerRuntime`. Pass a focused callback from `app-factory.ts` into `createSettingsRoutes`; after `applyServerSettingsPrefsWrite` succeeds, call the host setter with `result.settings.windowsInternalTerminalShell` before returning the response.

- [x] **Step 12: Run the complete worker configuration slice and observe GREEN**

Run:

```bash
bun run test src/server/terminal/terminal-worker-host.test.ts src/server/terminal/terminal-worker-runtime.test.ts src/server/terminal/terminal-session-manager-shell-preference.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/runtime.test.ts src/server/routes/settings.test.ts
```

Expected: all listed tests pass.

---

### Task 4: Add The Windows-Only Terminal Settings Selector

**Files:**

- Create: `src/web/runtime-settings-terminal-shell.ts`
- Create: `src/web/components/settings/pages/WindowsInternalTerminalShellSettings.tsx`
- Create: `src/web/components/settings/pages/WindowsInternalTerminalShellSettings.test.tsx`
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-write-paths.test.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Produces: `setWindowsInternalTerminalShell(pref): Promise<WindowsInternalTerminalShellPref>` in the settings client.
- Produces: `setWindowsInternalTerminalShellPreference(pref): Promise<void>` in web write paths.
- Produces: `useRuntimeWindowsInternalTerminalShellSettings()` and `useWindowsInternalTerminalShellController()`.

- [x] **Step 1: Write failing web write-path cache test**

Mock the settings client response and assert that a successful write updates the runtime settings query cache to the authoritative returned value rather than the requested value.

- [x] **Step 2: Run the web write-path test and observe RED**

Run:

```bash
bun run test src/web/settings-write-paths.test.ts
```

Expected: FAIL because no shell-preference client or write path exists.

- [x] **Step 3: Implement the settings client, write path, and runtime facade**

Post `{ windowsInternalTerminalShell: pref }` through the existing `/api/settings/prefs` boundary, return `result.settings.windowsInternalTerminalShell`, and update the runtime settings cache. Keep controller error handling inside `runSettingsControllerAction`.

- [x] **Step 4: Run the web write-path test and observe GREEN**

Run the Step 2 command. Expected: all web settings write-path tests pass.

- [x] **Step 5: Write failing Windows selector tests**

Render the focused component with `hostPlatform: 'win32'`, open the select, assert this literal option order, and choose PowerShell:

```ts
expect(optionLabels).toEqual([
  'settings.windows-internal-terminal-shell.auto',
  'settings.windows-internal-terminal-shell.wsl',
  'settings.windows-internal-terminal-shell.powershell',
  'settings.windows-internal-terminal-shell.cmd',
])
expect(controller.setWindowsInternalTerminalShell).toHaveBeenCalledWith('powershell')
```

Render again with a non-Windows host platform and assert the group is absent.

- [x] **Step 6: Run the component test and observe RED**

Run:

```bash
bun run test src/web/components/settings/pages/WindowsInternalTerminalShellSettings.test.tsx
```

Expected: FAIL because the component does not exist.

- [x] **Step 7: Implement the Windows-only selector and localized copy**

Use `getInitialBootstrap().hostPlatform === 'win32'`, `SettingsGroup`, `SettingsList`, `SettingsRow`, and `SettingsSelect`. Place the focused component first in `TerminalSettings`. Add sentence-case labels and help text in all four dictionaries, explicitly stating that the choice affects new/restarted local Windows internal terminals and not the project's Git environment.

- [x] **Step 8: Run the UI slice and observe GREEN**

Run:

```bash
bun run test src/web/components/settings/pages/WindowsInternalTerminalShellSettings.test.tsx src/web/settings-write-paths.test.ts
```

Expected: all listed UI and write-path tests pass.

---

### Task 5: Record The Domain Model And Verify The Repository

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-08-30-selectable-windows-internal-terminal-shell-design.md`
- Modify: `docs/superpowers/plans/2026-08-30-selectable-windows-internal-terminal-shell.md`

**Interfaces:**

- Adds canonical glossary term: `Selectable Windows internal terminal shell`.
- Preserves canonical distinction from `Selectable Windows external terminal`, `WSL project`, and `Windows project Git execution environment`.

- [x] **Step 1: Update the glossary immediately after implementation semantics are proven**

Add a concise implementation-free definition stating that the persisted preference applies to ordinary local Windows internal terminals, Automatic preserves the WSL-preferred fallback, explicit selections stay within their shell type, and running sessions are not switched.

- [x] **Step 2: Self-review spec and plan**

Check for placeholders, contradictions, accidental independent-package scope, renderer-owned policy, per-project behavior, or a claim that selecting WSL changes the Git backend. Correct any mismatch found.

- [x] **Step 3: Format changed source and documentation**

Run Prettier only on changed files:

```bash
bun x prettier --write <changed-files>
```

Expected: command exits 0 and changes only in-scope files.

- [x] **Step 4: Run focused feature verification**

Run all test files named in Tasks 1–4 in one Vitest invocation. Expected: all feature tests pass with zero failures.

- [ ] **Step 5: Run required repository verification**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: typecheck and architecture pass; the full test suite passes in a correctly provisioned project runtime. If the current WSL/Windows mixed environment reproduces the recorded platform-native baseline failures, preserve the exact output and distinguish it from focused feature results.

Execution note: typecheck and architecture passed, and 120 focused feature assertions passed. The full Windows Bun run reproduced unrelated Win32/POSIX failures and then hung while Vitest terminated fork workers, so this checkbox remains open pending a correctly provisioned Windows test run.

- [x] **Step 6: Inspect the final diff**

Use read-only Git diff/status with the worktree's translated gitdir. Confirm there are no edits under `windows/`, no dependency changes, no generated artifacts, no privacy-sensitive fixtures, and no unrelated modifications.

- [x] **Step 7: Perform completion review**

Use `requesting-code-review`, apply technically valid findings through TDD, rerun affected focused tests, then use `verification-before-completion` before reporting success.
