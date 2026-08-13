# Windows Hob CLI Project Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make hob . import and activate the current directory from a newly opened Windows PowerShell or Command Prompt.

**Architecture:** Package a Windows hob.cmd launcher that forwards one absolute directory as --hob-open <path> to the installed Electron executable. Electron main parses that explicit marker from initial or second-instance arguments and reuses the existing external-open queue and renderer project lifecycle. The per-user NSIS installer adds the launcher directory to user PATH; uninstall removes only that exact entry.

**Tech Stack:** Windows batch, PowerShell 5.1, Electron 42, Bun, TypeScript 6 strip-only mode, Vitest 4, electron-builder 26, NSIS.

---

## Constraints and file structure

- Preserve the existing macOS bin/hob launcher and import behavior.
- Keep project validation, recent-project writes, and activation in the existing external-open and renderer flow.
- Never use setx, edit shell profiles, or replace an unrelated hob executable.
- Preserve unrelated dirty worktree files and stage only task-owned files.
- Use repo-alias TypeScript imports with explicit extensions and no strip-only-incompatible syntax.
- bin/hob.cmd owns Windows command validation and app dispatch.
- src/main/windows-cli-project-open.ts owns pure argv parsing.
- build/windows-user-path.ps1 owns exact user-PATH transformation and registry update.
- build/installer.nsh owns NSIS install/uninstall hooks.

### Task 1: Add the Windows launcher

**Files:**

- Create: bin/hob.cmd
- Create: src/system/hob-cli-windows.test.ts

- [ ] **Step 1: Write failing executable-contract tests**

Create Windows-only tests that invoke:

~~~ts
spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', launcherPath, ...args], {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, ...env },
})
~~~

Set HOBGOBLIN_CLI_EXECUTABLE to a temporary capture .cmd. Assert hob . and zero-argument hob dispatch exactly:

~~~ts
['--hob-open', path.resolve(projectDirectory)]
~~~

Use a privacy-safe directory named project with spaces. Add separate tests for --help, an unknown option, two directories, a missing directory, a regular file, and a missing app executable. Invalid input must not invoke the capture command.

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/system/hob-cli-windows.test.ts
~~~

Expected: FAIL because bin/hob.cmd is absent.

- [ ] **Step 3: Implement the launcher**

~~~bat
@echo off
setlocal EnableExtensions DisableDelayedExpansion

if not "%~2"=="" goto too_many
if /I "%~1"=="-h" goto help
if /I "%~1"=="--help" goto help

set "HOB_TARGET=%~1"
if not defined HOB_TARGET set "HOB_TARGET=."
if "%HOB_TARGET:~0,1%"=="-" goto unknown_option
for %%I in ("%HOB_TARGET%") do set "HOB_TARGET=%%~fI"
if not exist "%HOB_TARGET%\." goto missing_directory

if defined HOBGOBLIN_CLI_EXECUTABLE (
  set "HOB_APP=%HOBGOBLIN_CLI_EXECUTABLE%"
) else (
  set "HOB_APP=%~dp0..\..\Hobgoblin.exe"
)
if not exist "%HOB_APP%" goto missing_app

start "" /b "%HOB_APP%" --hob-open "%HOB_TARGET%"
exit /b %ERRORLEVEL%

:help
echo Usage: hob [directory]
echo Open a local directory as a project in Hobgoblin for Windows.
exit /b 0

:too_many
>&2 echo hob: Expected at most one directory
exit /b 2

:unknown_option
>&2 echo hob: Unknown option: %HOB_TARGET%
exit /b 2

:missing_directory
>&2 echo hob: Directory does not exist: %HOB_TARGET%
exit /b 2

:missing_app
>&2 echo hob: Hobgoblin is not installed at the expected location: %HOB_APP%
exit /b 1
~~~

HOBGOBLIN_CLI_EXECUTABLE is test-only. Installed usage resolves Hobgoblin.exe relative to resources\bin.

- [ ] **Step 4: Verify GREEN and commit**

~~~sh
bun run test -- src/system/hob-cli-windows.test.ts src/system/hob-cli.test.ts
git add bin/hob.cmd src/system/hob-cli-windows.test.ts
git commit -m "feat(windows): add hob command launcher"
~~~

### Task 2: Parse CLI arguments at the Electron boundary

**Files:**

- Create: src/main/windows-cli-project-open.ts
- Create: src/main/windows-cli-project-open.test.ts

- [ ] **Step 1: Write failing parser tests**

~~~ts
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', 'C:\\work tree'], 'win32'))
  .toBe('C:\\work tree')
expect(windowsCliProjectOpenPathFromArgv(['electron.exe', '.', '--hob-open', '\\\\server\\share'], 'win32'))
  .toBe('\\\\server\\share')
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe'], 'win32')).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open'], 'win32')).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', '--inspect'], 'win32')).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(
  ['Hobgoblin.exe', '--hob-open', 'C:\\a', '--hob-open', 'C:\\b'],
  'win32',
)).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin', '--hob-open', '/tmp/repo'], 'darwin')).toBeNull()
~~~

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/main/windows-cli-project-open.test.ts
~~~

Expected: FAIL because the parser module is absent.

- [ ] **Step 3: Implement the parser**

~~~ts
export const WINDOWS_CLI_PROJECT_OPEN_FLAG = '--hob-open'

export function windowsCliProjectOpenPathFromArgv(
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') return null
  const indexes = argv.flatMap((value, index) =>
    value === WINDOWS_CLI_PROJECT_OPEN_FLAG ? [index] : [],
  )
  if (indexes.length !== 1) return null
  const candidate = argv[indexes[0]! + 1]
  if (!candidate || candidate.startsWith('--')) return null
  return candidate
}
~~~

- [ ] **Step 4: Verify GREEN and commit**

~~~sh
bun run test -- src/main/windows-cli-project-open.test.ts
git add src/main/windows-cli-project-open.ts src/main/windows-cli-project-open.test.ts
git commit -m "feat(windows): parse hob project-open arguments"
~~~

### Task 3: Connect first and second instances to external open

**Files:**

- Modify: src/main/main.ts
- Modify: src/main/main.test.ts

- [ ] **Step 1: Write failing lifecycle tests**

Mock windowsCliProjectOpenPathFromArgv, default it to null in beforeEach, and add:

~~~ts
test('queues a Windows hob path from the primary instance argv', async () => {
  mocks.windowsCliProjectOpenPathFromArgv.mockReturnValueOnce('C:\\workspace')
  await import('#/main/main.ts')
  expect(mocks.windowsCliProjectOpenPathFromArgv).toHaveBeenCalledWith(process.argv)
  expect(mocks.enqueueExternalOpenPath).toHaveBeenCalledWith('C:\\workspace')
})

test('queues a Windows hob path from a second instance before activation', async () => {
  await import('#/main/main.ts')
  const argv = ['Hobgoblin.exe', '--hob-open', 'C:\\workspace']
  mocks.windowsCliProjectOpenPathFromArgv.mockReturnValueOnce('C:\\workspace')
  await emit('second-instance', {}, argv)
  expect(mocks.windowsCliProjectOpenPathFromArgv).toHaveBeenCalledWith(argv)
  expect(mocks.enqueueExternalOpenPath).toHaveBeenCalledWith('C:\\workspace')
})
~~~

Update existing second-instance events to include event and argv parameters.

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/main/main.test.ts
~~~

Expected: new tests fail because main.ts does not inspect argv.

- [ ] **Step 3: Wire the existing import path**

After the single-instance lock succeeds, parse process.argv and enqueue a result before initialization. Replace the second-instance handler with:

~~~ts
app.on('second-instance', (_event, commandLine) => {
  const externalOpenPath = windowsCliProjectOpenPathFromArgv(commandLine)
  if (externalOpenPath) enqueueExternalOpenPath(externalOpenPath)
  activateMainWindowFromEvent()
})
~~~

Do not change macOS open-file handling. enqueueExternalOpenPath remains the authoritative path boundary.

- [ ] **Step 4: Verify GREEN and commit**

~~~sh
bun run test -- src/main/windows-cli-project-open.test.ts src/main/main.test.ts src/main/external-open.test.ts
git add src/main/main.ts src/main/main.test.ts
git commit -m "feat(windows): route hob paths through external open"
~~~

### Task 4: Add a safe user-PATH transformer

**Files:**

- Create: build/windows-user-path.ps1
- Create: src/system/windows-user-path.test.ts

- [ ] **Step 1: Write failing transformation tests**

Run the script with -TransformOnly and parse compact JSON. Assert empty add, idempotent exact add, case/trailing-slash equivalence, exact removal, and non-removal of a prefix-only path:

~~~ts
expect(transform('Add', cliPath, '')).toEqual({ Changed: true, Value: cliPath })
expect(transform('Add', cliPath, 'C:\\Tools;' + cliPath)).toEqual({
  Changed: false,
  Value: 'C:\\Tools;' + cliPath,
})
expect(transform('Add', cliPath, 'C:\\Tools;' + cliPath.toUpperCase() + '\\'))
  .toMatchObject({ Changed: false })
expect(transform('Remove', cliPath, 'C:\\Tools;' + cliPath + ';C:\\Other')).toEqual({
  Changed: true,
  Value: 'C:\\Tools;C:\\Other',
})
expect(transform('Remove', cliPath, 'C:\\Tools;' + cliPath + '-other'))
  .toMatchObject({ Changed: false })
~~~

Also assert the source uses EnvironmentVariableTarget]::User, exposes TransformOnly, and does not contain setx.

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/system/windows-user-path.test.ts
~~~

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement the transformer**

Create build/windows-user-path.ps1 with mandatory -Action Add|Remove, mandatory -Entry, optional -TransformOnly, and optional -PathValue. Normalize separators, surrounding quotes, case, and trailing separators only for comparison:

~~~powershell
function ConvertTo-ComparablePathEntry([string] $Value) {
  $normalized = $Value.Trim().Trim('"').Replace('/', '\')
  while ($normalized.Length -gt 3 -and $normalized.EndsWith('\')) {
    $normalized = $normalized.Substring(0, $normalized.Length - 1)
  }
  return $normalized
}
~~~

Split on semicolons, compare with OrdinalIgnoreCase, preserve original unrelated segments, add only when absent, and remove only exact normalized matches. Transform-only mode prints a compact JSON object with Changed and Value. Registry mode reads and writes only the current user's Path through EnvironmentVariableTarget::User. Exit 0 when changed, 10 when unchanged, and 1 with an actionable error on failure.

- [ ] **Step 4: Verify GREEN and commit**

~~~sh
bun run test -- src/system/windows-user-path.test.ts
git add build/windows-user-path.ps1 src/system/windows-user-path.test.ts
git commit -m "feat(windows): add safe hob PATH transformer"
~~~

### Task 5: Package the launcher and install PATH

**Files:**

- Create: build/installer.nsh
- Modify: electron-builder.ts
- Modify: src/system/build-script.test.ts

- [ ] **Step 1: Write failing packaging assertions**

Assert extraResources includes bin/hob.cmd, nsis.include equals build/installer.nsh, and the include defines customInstall/customUnInstall, Add/Remove actions, the resources\bin entry, and WM_SETTINGCHANGE notification.

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/system/build-script.test.ts
~~~

Expected: FAIL because the resource and custom include are absent.

- [ ] **Step 3: Implement NSIS hooks**

Create build/installer.nsh. Both hooks copy windows-user-path.ps1 to $PLUGINSDIR and invoke Windows PowerShell with -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass, the correct action, and $INSTDIR\resources\bin. Exit 0 broadcasts WM_SETTINGCHANGE with Environment; exit 10 is an idempotent no-op; other exits print diagnostics and warn in non-silent mode. NSIS must never edit PATH directly.

- [ ] **Step 4: Configure packaging**

~~~ts
extraResources: [
  { from: 'bin/hob', to: 'bin/hob' },
  { from: 'bin/hob.cmd', to: 'bin/hob.cmd' },
],
~~~

Add include: 'build/installer.nsh' to current nsis options.

- [ ] **Step 5: Verify tests and compile NSIS**

~~~sh
bun run test -- src/system/windows-user-path.test.ts src/system/build-script.test.ts src/system/hob-cli-windows.test.ts
bun run build:web
bun run build:electron -- --win nsis --x64 --config.npmRebuild=false
~~~

Expected: focused tests pass and x64 NSIS emits without include errors.

- [ ] **Step 6: Commit**

~~~sh
git add build/installer.nsh electron-builder.ts src/system/build-script.test.ts
git commit -m "feat(windows): install hob command on user PATH"
~~~

### Task 6: Document Windows usage

**Files:**

- Modify: README.md
- Modify: README.zh-CN.md
- Modify: README.ja.md
- Modify: README.ko.md
- Modify: docs/index.html
- Modify: src/system/build-script.test.ts

- [ ] **Step 1: Write failing documentation assertions**

Require every README to contain hob ., its current macOS launcher path, PowerShell, Get-Command hob -All, and where.exe hob. Require all four localized website labels to mention Windows and macOS.

- [ ] **Step 2: Verify RED**

~~~sh
bun run test -- src/system/build-script.test.ts src/system/release-documentation.test.ts
~~~

Expected: FAIL because current documentation calls hob macOS-only.

- [ ] **Step 3: Update documentation**

Change the feature summary to macOS and Windows. Add a Windows subsection explaining that the installer updates user PATH and a new terminal is required. Show hob ., Get-Command hob -All, and where.exe hob. Preserve macOS symlink instructions. Change all four website translations from macOS terminal to macOS or Windows terminal.

- [ ] **Step 4: Verify GREEN and commit**

~~~sh
bun run test -- src/system/build-script.test.ts src/system/release-documentation.test.ts
git add README.md README.zh-CN.md README.ja.md README.ko.md docs/index.html src/system/build-script.test.ts
git commit -m "docs: explain Windows hob project import"
~~~

### Task 7: Verify the complete contract

- [ ] **Step 1: Run focused behavior tests**

~~~sh
bun run test -- src/system/hob-cli-windows.test.ts src/system/windows-user-path.test.ts src/main/windows-cli-project-open.test.ts src/main/main.test.ts src/main/external-open.test.ts src/web/lib/open-repo-paths.test.ts src/system/build-script.test.ts
~~~

- [ ] **Step 2: Run repository gates**

~~~sh
bun run typecheck
bun run test
bun run check:architecture
bun run format:check
git diff --check
~~~

Do not rewrite unrelated user-modified files to hide a pre-existing failure.

- [ ] **Step 3: Audit packaged output**

~~~powershell
Test-Path release\win-unpacked\resources\bin\hob.cmd
Get-ChildItem release -Filter 'Hobgoblin-*-x64.exe'
~~~

- [ ] **Step 4: Audit requirements and worktree scope**

~~~sh
git status --short
git diff --stat
git log -8 --oneline
~~~

Map fresh evidence to hob ., first launch, running instance, path preservation, PATH idempotence, uninstall cleanup, and macOS compatibility. Confirm no unrelated dirty file was staged, reverted, or overwritten.

## Architecture grill result

- **Native boundary:** Only `src/main` reads Electron argv. The parser stays pure and imports neither `src/web` nor `src/server`.
- **Project lifecycle:** CLI code transports a path only. It never probes repositories, writes recent projects, or calls the embedded server; `openRepoPaths` and `ensureWorkspaceOpen` remain authoritative.
- **State ownership:** No new restorable or runtime-coherent state is introduced. The existing external-open intent wakes the renderer, which projects server-owned repository truth normally.
- **Realtime:** An occasional queued native intent remains sufficient; adding a WebSocket channel or polling would duplicate the established path.
- **First-instance race:** The path is queued only after the process owns the single-instance lock and before renderer initialization, so the renderer can drain it after startup.
- **Running-instance race:** The `second-instance` handler queues before it requests activation and continues to use the existing activation barrier.
- **Windows path fidelity:** The batch launcher quotes the one resolved path, the argv parser returns it unchanged, and `enqueueExternalOpenPath` performs final native-boundary validation.
- **Installer safety:** PATH changes are user-scoped, exact-entry based, case-insensitive for comparison, idempotent, reversible, and independent of shell profile files.
- **Uninstall safety:** Removal targets only the current installation's `resources\\bin` entry and never deletes prefix matches or unrelated entries.
- **Packaging:** Both launchers stay outside ASAR; macOS packaging and document-open behavior remain unchanged.

The repository references `.claude/skills/grill-with-docs/SKILL.md`, but that file is absent in the current worktree. This recorded grill is the manual fallback against `docs/arch.md`, `docs/layering.md`, `docs/state-sync.md`, `docs/renderer-model.md`, and `docs/realtime.md`.

## Plan self-review

- Every design success criterion maps to a task and a fresh verification command.
- File and symbol names are consistent across test, implementation, packaging, documentation, and audit steps.
- No placeholder, second project-import path, new dependency, unsupported TypeScript construct, or unrelated refactor remains.
