# WSL-Preferred Windows External Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Windows builds open local external terminals in the user's usable default WSL distribution through Windows Terminal, with native Windows fallbacks, without misclassifying the Windows desktop renderer as Mobile Web.

**Architecture:** Add one focused Node-only WSL capability helper per source-isolated package and consume it from both internal shell resolution and the external Windows Terminal backend. Keep paths as process arguments, preserve existing platform boundaries, and fall through to PowerShell only when Windows Terminal cannot spawn. Keep renderer device classification independent from shell selection and reject Windows desktop user agents before touch-capability fallback.

**Tech Stack:** TypeScript in Node strip-only mode, Vitest, Bun, Node child processes, Windows Terminal CLI, WSL CLI.

## Global Constraints

- Apply equivalent source changes to root `src/` and independent `windows/src/` trees.
- Do not introduce a runtime dependency or synchronization layer between the two packages.
- Use an absolute `%SystemRoot%\System32\wsl.exe`; never resolve it from a repository-controlled current directory.
- Use `wsl.exe --list --quiet` with a 5,000 ms timeout and require a non-empty successful result.
- Do not select, install, update, or configure a WSL distribution.
- Keep Windows working directories in argv or environment values, never interpolated into executable shell text.
- Do not treat WSL or Windows desktop touch capability as a Mobile Web presentation signal.
- Defer Git commit and push until explicit user confirmation.

---

### Task 1: Shared usable-WSL capability

**Files:**

- Create: `src/shared/windows-wsl.ts`
- Create: `windows/src/shared/windows-wsl.ts`
- Modify: `src/server/terminal/windows-terminal-shell.ts`
- Modify: `windows/src/server/terminal/windows-terminal-shell.ts`
- Test: `src/server/terminal/windows-terminal-shell.test.ts`
- Test: `windows/src/server/terminal/windows-terminal-shell.test.ts`

**Interfaces:**

- Produces: `resolveUsableWindowsWslExecutable(options?): string | null`
- Consumes: optional environment and file-existence inputs already used by internal shell resolution.

- [x] **Step 1: Preserve the focused internal resolver tests as the behavior contract**

```ts
expect(resolveWindowsTerminalShellCandidates({ env, fileExists })[0]).toEqual({
  kind: 'wsl',
  command: 'C:\\Windows\\System32\\wsl.exe',
  args: [],
})
```

- [x] **Step 2: Add the focused shared helper and route internal WSL resolution through it**

```ts
const wslExecutable = resolveUsableWindowsWslExecutable({ env, fileExists })
if (wslExecutable) addCandidate('wsl', wslExecutable, [])
```

- [x] **Step 3: Run both internal resolver tests**

Run root and `windows/`: `bun run test src/server/terminal/windows-terminal-shell.test.ts`

Expected: PASS with WSL first only for a successful non-empty distribution probe.

### Task 2: External Windows Terminal WSL preference

**Files:**

- Modify: `src/system/windows-terminal.test.ts`
- Modify: `windows/src/system/windows-terminal.test.ts`
- Modify: `src/system/windows-terminal.ts`
- Modify: `windows/src/system/windows-terminal.ts`

**Interfaces:**

- Consumes: `resolveUsableWindowsWslExecutable(): string | null`
- Preserves: `openInWindowsTerminal(p: string): Promise<ExecResult>`

- [x] **Step 1: Write equivalent failing tests in both packages**

```ts
expect(mocks.spawn).toHaveBeenCalledWith(
  'wt.exe',
  ['-d', 'C:\\repo', 'C:\\Windows\\System32\\wsl.exe'],
  expect.objectContaining({ detached: true, stdio: 'ignore' }),
)
```

Also assert an empty distribution list keeps `['-d', 'C:\\repo']`, and a failed Windows Terminal spawn uses the existing PowerShell launcher when available.

- [x] **Step 2: Run both focused external tests and verify RED**

Run root and `windows/`: `bun run test src/system/windows-terminal.test.ts`

Expected: FAIL because the current backend never appends `wsl.exe` and does not fall through after a Windows Terminal spawn failure.

- [x] **Step 3: Implement the minimal launch ordering**

```ts
const wslExecutable = resolveUsableWindowsWslExecutable()
const args = wslExecutable ? ['-d', p, wslExecutable] : ['-d', p]
await spawnDetached('wt.exe', args)
```

Record a Windows Terminal spawn error and attempt PowerShell when it is available; return the recorded error only when no fallback can launch.

- [x] **Step 4: Run both focused external tests and verify GREEN**

Run root and `windows/`: `bun run test src/system/windows-terminal.test.ts`

Expected: PASS for WSL preference, native fallback, spawn failure, invalid path, and missing terminal cases.

### Task 3: Documentation and full verification

**Files:**

- Modify: `CONTEXT.md`
- Create: `docs/superpowers/specs/2026-08-16-wsl-preferred-windows-external-terminal-design.md`
- Create: `docs/superpowers/plans/2026-08-16-wsl-preferred-windows-external-terminal.md`

**Interfaces:**

- Produces: stable distinction between WSL-preferred internal and external Windows terminal policies.

- [x] **Step 1: Verify source-isolated package parity**

```bash
cmp src/shared/windows-wsl.ts windows/src/shared/windows-wsl.ts
cmp src/system/windows-terminal.ts windows/src/system/windows-terminal.ts
cmp src/system/windows-terminal.test.ts windows/src/system/windows-terminal.test.ts
```

- [x] **Step 2: Run repository checks**

Run root: `bun run typecheck`, `bun run check:architecture`, `bun run test`.

Run `windows/`: `bun run typecheck`, `bun run test`.

Expected: every command exits zero with no test failures.

- [x] **Step 3: Review the final diff and defer Git operations**

Confirm the diff contains only the planned capability helper, terminal launch behavior, tests, and documentation. Present commit/push as an explicit final confirmation rather than executing it automatically.

### Task 4: Windows desktop Mobile Web guard

**Files:**

- Modify: `src/web/components/terminal/mobile-detection.ts`
- Modify: `windows/src/web/components/terminal/mobile-detection.ts`
- Create: `src/web/components/terminal/mobile-detection.test.ts`
- Create: `windows/src/web/components/terminal/mobile-detection.test.ts`

**Interfaces:**

- Preserves: `isMobileDevice(): boolean`
- Produces: Windows desktop user agents remain non-mobile before touch-capability fallback.

- [x] **Step 1: Write equivalent failing Windows touch-device tests**

```ts
stubDevice({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/1.0',
  maxTouchPoints: 10,
  hasTouchEvent: true,
})
expect(isMobileDevice()).toBe(false)
```

Also preserve Android user-agent detection, explicit mobile UA precedence, iPad desktop-user-agent touch detection, and non-touch desktop behavior.

- [x] **Step 2: Run both focused tests and verify RED**

Run root and `windows/`: `bun run test src/web/components/terminal/mobile-detection.test.ts`

Expected: only the touch-capable Windows desktop case fails because the current implementation treats touch capability as mobile unconditionally.

- [x] **Step 3: Add the minimal Windows desktop guard**

```ts
if (/Windows NT/i.test(navigator.userAgent)) return false
```

- [x] **Step 4: Run both focused tests and verify GREEN**

Run root and `windows/`: `bun run test src/web/components/terminal/mobile-detection.test.ts`

Expected: all five classification cases pass in both packages.
