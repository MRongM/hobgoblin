# Windows 11 Internal Terminal Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows 11 internal terminals prefer PowerShell 7, fall back safely to Windows PowerShell 5.1 and cmd, and prove packaged terminal input/output on GitHub Windows.

**Architecture:** Add a pure Windows executable resolver in the server terminal source layer and keep PTY spawning in `terminal-pty-runtime.ts`. Preserve all terminal protocols and renderer code. Extend the existing packaged Windows WebSocket smoke so it attaches, writes, observes output, resizes, and closes the real node-pty session.

**Tech Stack:** TypeScript 6 strip-only mode, Vitest 4, node-pty 1.1, Electron 42, PowerShell, GitHub Actions.

## Global Constraints

- Target Windows 11 x64; GitHub `windows-latest` supplies Windows Server ConPTY evidence but not exact Win11 client evidence.
- Do not add dependencies or a persisted shell setting.
- Do not search the repository/current directory for executables.
- Pass executable, arguments, and `cwd` structurally; never construct a shell command string.
- Product PowerShell sessions use `-NoLogo` and load the user's profile.
- Preserve explicit trusted commands and all POSIX, remote, tmux, protocol, and renderer behavior.
- Use repo-alias imports with explicit `.ts` extensions and avoid unsupported runtime TypeScript syntax.
- Do not commit or push until the user gives the deferred final confirmation.

---

### Task 1: Resolve Windows internal terminal shells safely

**Files:**

- Create: `src/server/terminal/windows-terminal-shell.ts`
- Create: `src/server/terminal/windows-terminal-shell.test.ts`

**Interfaces:**

- Produces: `WindowsTerminalShellCandidate` with `kind`, absolute `command`, and `args`.
- Produces: `resolveWindowsTerminalShellCandidates(options?)` for production and deterministic tests.
- Consumes later: `terminal-pty-runtime.ts` iterates the ordered candidate list.

- [ ] **Step 1: Write resolver tests first**

Cover standard PowerShell 7 precedence, absolute `PATH` lookup, Windows PowerShell fallback, invalid relative `%COMSPEC%`, cmd fallback, case-insensitive deduplication, and rejection of relative/current-directory PATH entries. Tests inject `env` and `fileExists`, for example:

```ts
expect(
  resolveWindowsTerminalShellCandidates({
    env: {
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      PATH: 'tools;C:\\Users\\dev\\bin',
      COMSPEC: 'cmd.exe',
    },
    fileExists: (candidate) => existing.has(candidate.toLowerCase()),
  }),
).toEqual([
  {
    kind: 'powershell-core',
    command: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    args: ['-NoLogo'],
  },
  {
    kind: 'windows-powershell',
    command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    args: ['-NoLogo'],
  },
  { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
])
```

- [ ] **Step 2: Run the resolver tests and observe RED**

Run:

```bash
bun run test src/server/terminal/windows-terminal-shell.test.ts
```

Expected: FAIL because the resolver module does not exist.

- [ ] **Step 3: Implement the minimal pure resolver**

Use `path.win32`, case-insensitive environment lookup, absolute PATH entries only, a file probe, and case-insensitive candidate deduplication. The public shape is:

```ts
export type WindowsTerminalShellKind = 'powershell-core' | 'windows-powershell' | 'cmd'

export interface WindowsTerminalShellCandidate {
  kind: WindowsTerminalShellKind
  command: string
  args: string[]
}

export function resolveWindowsTerminalShellCandidates(
  options: {
    env?: NodeJS.ProcessEnv
    fileExists?: (filePath: string) => boolean
  } = {},
): WindowsTerminalShellCandidate[]
```

The production file probe follows links and accepts only files. Candidate paths are always absolute and never fall back to a bare executable name.

- [ ] **Step 4: Run resolver tests and observe GREEN**

Run the Task 1 test command. Expected: all resolver tests pass.

---

### Task 2: Spawn the preferred shell with fallback

**Files:**

- Modify: `src/server/terminal/terminal-pty-runtime.ts`
- Modify: `src/server/terminal/terminal-pty-runtime.test.ts`

**Interfaces:**

- Consumes: `resolveWindowsTerminalShellCandidates()` from Task 1.
- Preserves: `spawnTerminalPtyRuntime(input)` and its result contract for every caller.

- [ ] **Step 1: Replace the existing COMSPEC expectation with failing PowerShell tests**

Mock `resolveWindowsTerminalShellCandidates` at the module boundary in `spawnTerminalPtyRuntime` tests and assert:

```ts
expect(spawnMock).toHaveBeenCalledWith(
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  ['-NoLogo'],
  expect.objectContaining({ cwd: 'C:\\repo' }),
)
```

Add a fallback test where the first `node-pty.spawn` call throws and the second candidate succeeds. Add a test proving explicit `command` and `args` bypass automatic candidates.

- [ ] **Step 2: Run PTY tests and observe RED**

Run:

```bash
bun run test src/server/terminal/terminal-pty-runtime.test.ts
```

Expected: FAIL because Windows still selects COMSPEC and does not retry candidates.

- [ ] **Step 3: Implement candidate iteration**

Keep POSIX behavior unchanged. Build the existing PTY options once, then on Windows without an explicit command iterate the resolver result:

```ts
let lastError: unknown = new Error('No supported Windows terminal shell found')
for (const candidate of resolveWindowsTerminalShellCandidates()) {
  try {
    const term = pty.spawn(candidate.command, input.args ?? candidate.args, {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    })
    const windowsPty = detectWindowsPtyCompatibility(process.platform, os.release())
    return windowsPty
      ? { ok: true, runtime: new NodePtyTerminalRuntime(term), windowsPty }
      : { ok: true, runtime: new NodePtyTerminalRuntime(term) }
  } catch (error) {
    lastError = error
  }
}
return { ok: false, message: lastError instanceof Error ? lastError.message : 'error.unknown' }
```

An explicit command remains a single attempt. Return the existing failure result after all candidates fail; do not retry after a successfully spawned shell later exits.

- [ ] **Step 4: Run focused terminal tests and observe GREEN**

Run:

```bash
bun run test src/server/terminal/windows-terminal-shell.test.ts src/server/terminal/terminal-pty-runtime.test.ts src/server/terminal/terminal.test.ts
```

Expected: all focused tests pass.

---

### Task 3: Prove packaged terminal attachment and command I/O on Windows

**Files:**

- Modify: `.github/workflows/windows-test.yml`

**Interfaces:**

- Consumes: the existing `/ws/terminal` request protocol.
- Produces: a release-gating smoke assertion for create, attach, write/output, resize, and close.

- [ ] **Step 1: Add response/output collection helpers to the PowerShell smoke**

Add helpers that keep terminal output in a `StringBuilder` while waiting for a matching `requestId`. They ignore unrelated realtime events and fail through the existing cancellation token:

```powershell
function Add-TerminalOutput {
  param(
    [Parameter(Mandatory = $true)][object]$Message,
    [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Output
  )
  if ($Message.type -eq "output" -and $Message.event -and $Message.event.data) {
    [void]$Output.Append([string]$Message.event.data)
  }
}

function Wait-TerminalResponse {
  param(
    [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
    [Parameter(Mandatory = $true)][System.Threading.CancellationToken]$Token,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Output
  )
  while ($true) {
    $message = Receive-WebSocketJson -Socket $Socket -Token $Token
    Add-TerminalOutput -Message $message -Output $Output
    if ($message.type -eq "response" -and $message.requestId -eq $RequestId) {
      return $message
    }
  }
}

function Wait-TerminalOutput {
  param(
    [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
    [Parameter(Mandatory = $true)][System.Threading.CancellationToken]$Token,
    [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Output,
    [Parameter(Mandatory = $true)][string[]]$Expected
  )
  while ($Expected.Where({ -not $Output.ToString().Contains($_) }).Count -gt 0) {
    $message = Receive-WebSocketJson -Socket $Socket -Token $Token
    Add-TerminalOutput -Message $message -Output $Output
  }
}
```

- [ ] **Step 2: Extend the smoke transaction**

After create:

```powershell
Send-WebSocketJson -Socket $socket -Token $cts.Token -Payload @{
  type = "request"
  requestId = "terminal_smoke_attach"
  action = "attach"
  input = @{
    sessionId = $sessionId
    cols = 90
    rows = 28
    attachmentId = $attachmentId
  }
}
```

Assert the packaged runner selected `pwsh` or `powershell`, the returned Windows PTY backend is `conpty`, and its build number is present. Send a command that constructs a unique Unicode marker so the echoed input cannot satisfy the output assertion:

```powershell
$marker = "__HOBGOBLIN_终端_IO_OK__"
$command = "[Console]::WriteLine(('__HOBGOBLIN_' + '终端_IO_OK__')); [Console]::WriteLine((Get-Location).Path)`r"
```

Wait until output contains both `$marker` and the Unicode workspace path. Then exercise resize and close through explicit requests:

```powershell
Wait-TerminalOutput -Socket $socket -Token $cts.Token -Output $terminalOutput -Expected @($marker, $WorkspacePath)

Send-WebSocketJson -Socket $socket -Token $cts.Token -Payload @{
  type = "request"
  requestId = "terminal_smoke_resize"
  action = "resize"
  input = @{ sessionId = $sessionId; cols = 100; rows = 32; attachmentId = $attachmentId }
}
$resizeResponse = Wait-TerminalResponse -Socket $socket -Token $cts.Token -RequestId "terminal_smoke_resize" -Output $terminalOutput
if ($resizeResponse.ok -ne $true -or $resizeResponse.payload -ne $true) {
  throw "Terminal resize failed"
}

Send-WebSocketJson -Socket $socket -Token $cts.Token -Payload @{
  type = "request"
  requestId = "terminal_smoke_close"
  action = "close"
  input = @{ sessionId = $sessionId }
}
$closeResponse = Wait-TerminalResponse -Socket $socket -Token $cts.Token -RequestId "terminal_smoke_close" -Output $terminalOutput
if ($closeResponse.ok -ne $true -or $closeResponse.payload.ok -ne $true) {
  throw "Terminal close failed"
}
```

- [ ] **Step 3: Review workflow safety and syntax locally**

Run:

```bash
git diff --check -- .github/workflows/windows-test.yml
```

Expected: no whitespace errors. Confirm every path remains quoted and no secret value is printed.

---

### Task 4: Full local verification and deferred Windows handoff

**Files:**

- Verify all files changed by Tasks 1–3 plus the approved design/research/glossary documents.

- [ ] **Step 1: Run formatting checks on touched files**

```bash
bunx prettier --check \
  CONTEXT.md \
  docs/research/2026-08-10-windows-11-internal-shell.md \
  docs/superpowers/specs/2026-08-10-windows-11-internal-shell-design.md \
  docs/superpowers/plans/2026-08-10-windows-11-internal-shell.md \
  src/server/terminal/windows-terminal-shell.ts \
  src/server/terminal/windows-terminal-shell.test.ts \
  src/server/terminal/terminal-pty-runtime.ts \
  src/server/terminal/terminal-pty-runtime.test.ts \
  .github/workflows/windows-test.yml
```

Expected: all matched files use Prettier formatting.

- [ ] **Step 2: Run required project verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit zero.

- [ ] **Step 3: Inspect only task-owned changes**

```bash
git diff --check
git status --short
git diff -- \
  CONTEXT.md \
  docs/research/2026-08-10-windows-11-internal-shell.md \
  docs/superpowers/specs/2026-08-10-windows-11-internal-shell-design.md \
  docs/superpowers/plans/2026-08-10-windows-11-internal-shell.md \
  src/server/terminal/windows-terminal-shell.ts \
  src/server/terminal/windows-terminal-shell.test.ts \
  src/server/terminal/terminal-pty-runtime.ts \
  src/server/terminal/terminal-pty-runtime.test.ts \
  .github/workflows/windows-test.yml
```

Expected: no unrelated edits are included; concurrent `WorkspaceRepositoryRail` changes remain untouched.

- [ ] **Step 4: Request the single deferred dangerous-operation confirmation**

After local verification, ask once for permission to stage only task-owned files, commit, push the current branch, and dispatch/observe the GitHub Windows workflow. Do not stage the concurrent workspace-rail edits.

- [ ] **Step 5: After approval, complete GitHub Windows proof**

Push the task commit, dispatch or observe `Windows Test Build`, wait for completion, inspect logs for the PowerShell identity, ConPTY metadata, Unicode marker, workspace path, resize, close, renderer startup, and artifact upload. Fix any Windows-only failure with the same RED/GREEN discipline before declaring completion.
