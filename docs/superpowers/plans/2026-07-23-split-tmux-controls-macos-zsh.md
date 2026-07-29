# Split Tmux Controls and macOS Zsh Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split local and SSH tmux behavior into independent settings and make local macOS launches discover Homebrew tmux through the user's login shell.

**Architecture:** Replace the current global runtime-coherent tmux preference with server-owned local and remote booleans, migrate persisted global state at the settings source boundary, and route each terminal launch through the matching setting. Keep deterministic tmux identity unchanged; fix only the local invocation adapter by using its selected login shell as the tmux-detection wrapper.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Bun 1.3, Vitest, React 19, node-pty, tmux, macOS zsh, TanStack Query.

## Global Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Add no dependencies.
- Keep settings truth server-owned and runtime-coherent through existing invalidation/refetch paths.
- Keep `src/main/**`, `src/server/**`, `src/web/**`, and `src/shared/**` architecture boundaries green.
- Both scoped settings default to `false`.
- Local and remote settings each control in-app and supported external Terminal/Ghostty launches.
- Preserve privacy-safe fixtures and examples.
- Do not commit, push, reset, or create branches; the user requested inline implementation without Git mutations.

---

### Task 1: Reproduce and fix local login-shell tmux discovery

**Files:**
- Modify: `src/system/local-terminal.test.ts`
- Modify: `src/system/local-terminal.ts`

**Interfaces:**
- Consumes: `TmuxSessionDescriptor`, `buildTmuxSessionName()`.
- Produces: `buildManagedLocalTerminalInvocation(target, options)` returning a command that is the selected safe login shell, `['-lc', script]`, and matching `shellCommand`.

- [ ] **Step 1: Add a failing macOS wrapper test**

Add assertions proving an explicit `/bin/zsh` is both the wrapper command and fallback shell:

```ts
expect(invocation).toMatchObject({ command: '/bin/zsh', args: ['-lc', expect.any(String)] })
expect(invocation?.script).toContain("exec '/bin/zsh' -l")
expect(invocation?.shellCommand).toContain("'/bin/zsh' '-lc'")
```

Add a second test proving macOS defaults to `/bin/zsh` when `SHELL` is unavailable by temporarily deleting and restoring `process.env.SHELL`.

- [ ] **Step 2: Verify RED**

Run: `bun run test src/system/local-terminal.test.ts`

Expected: FAIL because the current invocation command is `/bin/sh`.

- [ ] **Step 3: Implement the minimal wrapper change**

Change `LocalTerminalInvocation.command` from the `/bin/sh` literal to `string`. Resolve the shell with this precedence:

```ts
const loginShell =
  safeAbsoluteCommand(options.fallbackShell) ??
  safeAbsoluteCommand(process.env.SHELL) ??
  (platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
```

Use `loginShell` for `command`, `['-lc', script]`, `shellCommand`, and the final `exec <loginShell> -l`. Keep the tmux availability check and deterministic session command unchanged.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test src/system/local-terminal.test.ts src/system/apple-terminal.test.ts src/system/ghostty.test.ts`

Expected: PASS.

---

### Task 2: Split the settings contract and persisted migration

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/shared/settings-snapshot.test.ts`
- Modify: `src/shared/native-shell-projection.test.ts`
- Modify: `src/main/preload.test.ts`
- Modify: `src/main/rpc.test.ts`
- Modify: `src/server/app-factory.test.ts`
- Modify: `src/server/modules/settings-write-paths.test.ts`
- Modify: `src/server/modules/settings.test.ts`
- Modify: `src/web/bootstrap.test.ts`
- Modify: `src/web/stores/bootstrap-seed.test.ts`
- Modify: `src/web/stores/session-restore.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

**Interfaces:**
- Produces: `SettingsPrefs.localTerminalTmuxEnabled: boolean` and `SettingsPrefs.remoteTerminalTmuxEnabled: boolean` in settings snapshots, bootstrap state, and native projections.
- Migration input only: persisted `internalTerminalTmuxEnabled`.

- [ ] **Step 1: Write failing settings migration tests**

Cover this table in `settings-source.test.ts`:

```ts
{ persisted: {}, local: false, remote: false }
{ persisted: { internalTerminalTmuxEnabled: true }, local: true, remote: true }
{ persisted: { internalTerminalTmuxEnabled: false }, local: false, remote: false }
{ persisted: { remoteTerminalTmuxEnabled: true }, local: false, remote: true }
{ persisted: { localTerminalTmuxEnabled: true, remoteTerminalTmuxEnabled: false }, local: true, remote: false }
{ persisted: { localTerminalTmuxEnabled: false, remoteTerminalTmuxEnabled: true, internalTerminalTmuxEnabled: false }, local: false, remote: true }
```

After updating preferences, assert the persisted file contains both scoped fields and does not contain `internalTerminalTmuxEnabled`.

- [ ] **Step 2: Verify RED**

Run: `bun run test src/server/modules/settings-source.test.ts`

Expected: FAIL because scoped settings do not exist.

- [ ] **Step 3: Implement scoped defaults and migration**

Replace the global field throughout shared contracts with:

```ts
localTerminalTmuxEnabled: boolean
remoteTerminalTmuxEnabled: boolean
```

Define both default constants as `false`. In `readServerSettingsFile()`, read persisted data through a compatibility shape containing `internalTerminalTmuxEnabled?: unknown`, then normalize each scoped value with its own field first and the global field second:

```ts
function normalizeScopedTmuxEnabled(value: unknown, globalLegacyValue?: unknown): boolean {
  if (typeof value === 'boolean') return value
  return globalLegacyValue === true
}
```

Store and write only the two scoped fields. Update change detection, patch application, `settingsPrefsFromData()`, snapshots, bootstrap, and native projections.

- [ ] **Step 4: Update typed test fixtures**

Replace each `internalTerminalTmuxEnabled: false` fixture with both scoped fields set to `false`. Where a test needs enabled tmux, set only the scope asserted by that test. Keep the legacy field only in migration-input objects inside `settings-source.test.ts`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun run test src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts src/shared/native-shell-projection.test.ts src/main/preload.test.ts src/main/rpc.test.ts src/server/app-factory.test.ts src/server/modules/settings-write-paths.test.ts src/server/modules/settings.test.ts src/web/bootstrap.test.ts src/web/stores/bootstrap-seed.test.ts src/web/stores/session-restore.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: PASS.

---

### Task 3: Route local and SSH launches through independent settings

**Files:**
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/remote.test.ts`
- Modify: `src/server/modules/remote.ts`

**Interfaces:**
- Terminal catalog consumes `localTerminalTmuxEnabled()` and `remoteTerminalTmuxEnabled()` preference readers.
- Local external launches consume `prefs.localTerminalTmuxEnabled`.
- SSH external launches consume `prefs.remoteTerminalTmuxEnabled`.

- [ ] **Step 1: Write failing terminal-routing tests**

Configure opposing values and assert the generated command/arguments:

```ts
getServerSettingsPrefs.mockResolvedValue({
  ...prefs,
  localTerminalTmuxEnabled: true,
  remoteTerminalTmuxEnabled: false,
})
```

Prove a local in-app launch uses tmux while an SSH in-app launch does not. Add the inverse case. Update repository and remote external-terminal tests so local forwarding expects `{ useTmux: prefs.localTerminalTmuxEnabled }` and SSH forwarding expects `{ useTmux: prefs.remoteTerminalTmuxEnabled }`.

- [ ] **Step 2: Verify RED**

Run: `bun run test src/server/terminal/terminal.test.ts src/server/modules/repo.test.ts src/server/modules/remote.test.ts`

Expected: FAIL because both paths still read the removed global preference.

- [ ] **Step 3: Implement narrow routing readers**

Replace the catalog option with:

```ts
localTerminalTmuxEnabled(): MaybePromise<boolean>
remoteTerminalTmuxEnabled(): MaybePromise<boolean>
```

Read the local value only in `ensureLocalSession()` and the remote value only in `ensureRemote()`. Wire both readers in `terminal.ts`. Update `openRepositoryTerminal()` and `openRemoteTerminal()` to pass the matching scoped preference.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test src/server/terminal/terminal.test.ts src/server/modules/repo.test.ts src/server/modules/remote.test.ts`

Expected: PASS.

---

### Task 4: Expose two renderer controls and translations

**Files:**
- Modify: `src/web/settings-client.test.ts`
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.test.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/runtime-settings-terminal-buttons.ts`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Produces client/write functions `setLocalTerminalTmuxEnabled*()` and `setRemoteTerminalTmuxEnabled*()`.
- `useRuntimeTerminalSettings()` returns both scoped booleans.
- The terminal settings controller exposes matching setters.

- [ ] **Step 1: Write failing renderer write and UI tests**

Assert independent request bodies:

```ts
{ localTerminalTmuxEnabled: true }
{ remoteTerminalTmuxEnabled: true }
```

Render terminal settings with opposing values, assert two labelled switches, click each, and assert only its matching patch is sent.

- [ ] **Step 2: Verify RED**

Run: `bun run test src/web/settings-client.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx`

Expected: FAIL because only the global setter and switch exist.

- [ ] **Step 3: Implement renderer read/write paths**

Replace the global client and preference setters with local and remote versions. Each successful write updates only its matching field in the runtime settings query cache. Return both fields from `readRuntimeTerminalSettings()` and expose both actions through the existing terminal settings runtime facade.

- [ ] **Step 4: Implement two settings rows and localized copy**

Use stable control IDs:

```text
settings-terminal-tmux-local
settings-terminal-tmux-remote
```

Add localized title, group hint, local label/hint, and remote label/hint keys in all four dictionaries. Hints must say the scope applies to in-app and supported external terminals.

- [ ] **Step 5: Verify GREEN**

Run: `bun run test src/web/settings-client.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

---

### Task 5: Domain docs, stale-name audit, and full verification

**Files:**
- Modify: `CONTEXT.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Verify: `docs/superpowers/specs/2026-07-23-split-tmux-controls-macos-zsh-design.md`
- Verify: `docs/terminal-tmux-protocol.md`

**Interfaces:**
- Adds glossary terms for the local and remote tmux preferences without implementation details.

- [ ] **Step 1: Update the glossary**

Add concise definitions stating that the local preference governs eligible local in-app and external launches, while the remote preference governs eligible SSH in-app and external launches. Do not change tmux session descriptor or name definitions.

- [ ] **Step 2: Audit stale global names**

Run:

```bash
rg -n "internalTerminalTmuxEnabled|DEFAULT_INTERNAL_TERMINAL_TMUX_ENABLED|setInternalTerminalTmuxEnabled" src | rg -v '^src/server/modules/settings-source(\.test)?\.ts:'
```

Expected: no matches. A broader search may find the persisted compatibility name only in `src/server/modules/settings-source.ts` and its migration tests; remove it from runtime contracts and UI.

- [ ] **Step 3: Run focused terminal and settings suites**

Run:

```bash
bun run test src/system/local-terminal.test.ts src/system/apple-terminal.test.ts src/system/ghostty.test.ts src/system/remote-terminal.test.ts src/server/terminal/terminal.test.ts src/server/modules/repo.test.ts src/server/modules/remote.test.ts src/server/modules/settings-source.test.ts src/shared/settings-snapshot.test.ts src/web/settings-client.test.ts src/web/settings-write-paths.test.ts src/web/components/SettingsSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run required project verification**

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run test`

Expected: exit 0 with zero failed tests.

Run: `bun run check:architecture`

Expected: exit 0.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only scoped source, tests, glossary, design, and plan files are modified. Do not stage or commit them.
