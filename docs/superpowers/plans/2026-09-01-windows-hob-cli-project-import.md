# Windows Hob CLI Project Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hob`, `hob .`, and `hob <directory>` import and activate a local project from a newly opened Windows PowerShell or Command Prompt.

**Architecture:** Package a Windows `hob.cmd` launcher that forwards one absolute directory as `--hob-open <path>` to the installed Electron executable. Electron main parses that explicit marker from initial or second-instance arguments and reuses the existing external-open queue and renderer project lifecycle. The per-user NSIS installer adds the launcher directory to user PATH; uninstall removes only that exact entry.

**Tech Stack:** Windows batch, Windows PowerShell 5.1, Electron 42, Bun 1.3, TypeScript 6 strip-only mode, Vitest 4, electron-builder 26, NSIS.

---

## Constraints and file structure

- Preserve the existing macOS `bin/hob` launcher and import behavior.
- Keep project validation, recent-project writes, and activation in the existing external-open and renderer flow.
- Never use `setx`, edit shell profiles, modify machine PATH, or replace an unrelated `hob` executable.
- Preserve unrelated worktree changes and stage only task-owned files.
- Use repo-alias TypeScript imports with explicit extensions and no strip-only-incompatible syntax.
- `bin/hob.cmd` owns Windows command validation and app dispatch.
- `src/main/windows-cli-project-open.ts` owns pure argv parsing.
- `build/windows-user-path.ps1` owns exact user-PATH transformation and registry update.
- `build/installer.nsh` owns NSIS install/uninstall hooks.

### Task 1: Add the Windows launcher

**Files:**

- Create: `src/system/hob-cli-windows.test.ts`
- Create: `bin/hob.cmd`

- [ ] **Step 1: Write failing executable-contract tests**

Create a Windows-only Vitest suite that runs the repository launcher through:

```ts
spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', commandPath, ...args], {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, ...env },
})
```

The suite must create a privacy-safe `project with spaces` fixture and a capture command selected through `HOBGOBLIN_CLI_EXECUTABLE`. Assert these behaviors independently:

- `hob .` dispatches exactly `['--hob-open', path.resolve(projectDirectory)]`.
- zero-argument `hob` dispatches the current directory.
- `ELECTRON_RUN_AS_NODE` is unset for the child application.
- `-h` and `--help` print `Usage: hob [directory]` without dispatching.
- unknown options and more than one directory exit 2 without dispatching.
- missing directories and regular files exit 2 without dispatching.
- a missing installed executable exits 1 and names `Hobgoblin.exe`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
bun run test -- src/system/hob-cli-windows.test.ts
```

Expected: FAIL because `bin/hob.cmd` does not exist.

- [ ] **Step 3: Implement the launcher**

Create `bin/hob.cmd` with this exact behavior:

```bat
@echo off
setlocal DisableDelayedExpansion

if not "%~2"=="" goto too_many_arguments

set "target=%~1"
if not defined target set "target=."

if "%target%"=="-h" goto help
if "%target%"=="--help" goto help
if "%target:~0,1%"=="-" goto unknown_option

for %%I in ("%target%") do set "target=%%~fI"
if not exist "%target%" goto missing_directory
for %%I in ("%target%") do set "target_attributes=%%~aI"
if not "%target_attributes:~0,1%"=="d" goto not_directory

set "ELECTRON_RUN_AS_NODE="

if defined HOBGOBLIN_CLI_EXECUTABLE goto launch_override

for %%I in ("%~dp0..\..\Hobgoblin.exe") do set "executable=%%~fI"
if not exist "%executable%" goto missing_application

start "" "%executable%" "--hob-open" "%target%"
if errorlevel 1 goto dispatch_failed
exit /b 0

:launch_override
set "executable=%HOBGOBLIN_CLI_EXECUTABLE%"
if not exist "%executable%" goto missing_application
call "%executable%" "--hob-open" "%target%"
if errorlevel 1 goto dispatch_failed
exit /b 0

:help
call :usage
exit /b 0

:too_many_arguments
echo hob: Expected at most one directory. 1>&2
exit /b 2

:unknown_option
echo hob: Unknown option: "%target%". 1>&2
call :usage 1>&2
exit /b 2

:missing_directory
echo hob: Directory does not exist: "%target%". 1>&2
exit /b 2

:not_directory
echo hob: Not a directory: "%target%". 1>&2
exit /b 2

:missing_application
echo hob: Hobgoblin application executable was not found at "%executable%". Reinstall Hobgoblin. 1>&2
exit /b 1

:dispatch_failed
echo hob: Failed to start Hobgoblin from "%executable%". 1>&2
exit /b 1

:usage
echo Usage: hob [directory]
echo Open a local directory as a project in Hobgoblin for Windows.
exit /b 0
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
bun run test -- src/system/hob-cli-windows.test.ts src/system/hob-cli.test.ts
git add -- bin/hob.cmd src/system/hob-cli-windows.test.ts
git commit -m "feat(windows): add hob command launcher"
```

Expected: both launcher suites pass.

### Task 2: Parse CLI arguments at the Electron boundary

**Files:**

- Create: `src/main/windows-cli-project-open.test.ts`
- Create: `src/main/windows-cli-project-open.ts`

- [ ] **Step 1: Write failing parser tests**

Cover the exact API:

```ts
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', 'C:\\work tree'], 'win32')).toBe(
  'C:\\work tree',
)
expect(
  windowsCliProjectOpenPathFromArgv(['electron.exe', '.', '--hob-open', '\\\\server\\share'], 'win32'),
).toBe('\\\\server\\share')
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe'], 'win32')).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open'], 'win32')).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', '--inspect'], 'win32')).toBeNull()
expect(
  windowsCliProjectOpenPathFromArgv(
    ['Hobgoblin.exe', '--hob-open', 'C:\\a', '--hob-open', 'C:\\b'],
    'win32',
  ),
).toBeNull()
expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin', '--hob-open', '/tmp/repo'], 'darwin')).toBeNull()
```

- [ ] **Step 2: Verify RED**

```powershell
bun run test -- src/main/windows-cli-project-open.test.ts
```

Expected: FAIL because the parser module is absent.

- [ ] **Step 3: Implement the parser**

```ts
export const WINDOWS_CLI_PROJECT_OPEN_FLAG = '--hob-open'

export function windowsCliProjectOpenPathFromArgv(
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') return null

  const markerIndexes = argv.flatMap((value, index) => (value === WINDOWS_CLI_PROJECT_OPEN_FLAG ? [index] : []))
  if (markerIndexes.length !== 1) return null

  const candidate = argv[markerIndexes[0]! + 1]
  if (!candidate || candidate.startsWith('--')) return null
  return candidate
}
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
bun run test -- src/main/windows-cli-project-open.test.ts
git add -- src/main/windows-cli-project-open.ts src/main/windows-cli-project-open.test.ts
git commit -m "feat(windows): parse hob project-open arguments"
```

### Task 3: Connect first and second instances to external open

**Files:**

- Modify: `src/main/main.test.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Mock `windowsCliProjectOpenPathFromArgv`, reset it to `null` in `beforeEach`, and add three behaviors:

```ts
test('queues a Windows hob path from the primary instance argv', async () => {
  mocks.windowsCliProjectOpenPathFromArgv.mockReturnValueOnce('C:\\workspace')

  await import('#/main/main.ts')

  expect(mocks.requestSingleInstanceLock).toHaveBeenCalledWith({ hobOpenPath: 'C:\\workspace' })
  expect(mocks.windowsCliProjectOpenPathFromArgv).toHaveBeenCalledWith(process.argv)
  expect(mocks.enqueueExternalOpenPath).toHaveBeenCalledWith('C:\\workspace')
})

test('queues a Windows hob path from a second instance before activation', async () => {
  await import('#/main/main.ts')
  const commandLine = ['Hobgoblin.exe', '--hob-open', 'C:\\workspace']
  mocks.windowsCliProjectOpenPathFromArgv.mockReturnValueOnce('C:\\workspace')

  await emit('second-instance', {}, commandLine)

  expect(mocks.windowsCliProjectOpenPathFromArgv).toHaveBeenCalledWith(commandLine)
  expect(mocks.enqueueExternalOpenPath).toHaveBeenCalledWith('C:\\workspace')
})

test('queues a Windows hob path from second-instance additional data when Electron rewrites argv', async () => {
  await import('#/main/main.ts')
  const commandLine = ['Hobgoblin.exe', '--hob-open', '--allow-file-access-from-files', '.', 'C:\\workspace']

  await emit('second-instance', {}, commandLine, 'C:\\cwd', { hobOpenPath: 'C:\\workspace' })

  expect(mocks.enqueueExternalOpenPath).toHaveBeenCalledWith('C:\\workspace')
})
```

Update existing `second-instance` lifecycle tests to emit an event object and command-line array.

- [ ] **Step 2: Verify RED**

```powershell
bun run test -- src/main/main.test.ts
```

Expected: the new tests fail because `main.ts` neither transports lock data nor inspects Windows argv.

- [ ] **Step 3: Wire the existing import path**

Import the parser and add these pure helpers:

```ts
function externalOpenSingleInstanceData(path: string | null): Record<string, string> {
  return path ? { hobOpenPath: path } : {}
}

function externalOpenPathFromSingleInstanceData(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as Record<string, unknown>).hobOpenPath
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}
```

Before initializing the main process, parse and pass the first path through the lock:

```ts
const initialExternalOpenPath = windowsCliProjectOpenPathFromArgv(process.argv)
if (!app.requestSingleInstanceLock(externalOpenSingleInstanceData(initialExternalOpenPath))) {
  app.quit()
  return
}
if (initialExternalOpenPath) enqueueExternalOpenPath(initialExternalOpenPath)
```

Replace the second-instance handler with:

```ts
app.on('second-instance', (_event, commandLine, _workingDirectory, additionalData) => {
  const commandLineExternalOpenPath = windowsCliProjectOpenPathFromArgv(commandLine)
  const externalOpenPath = externalOpenPathFromSingleInstanceData(additionalData) ?? commandLineExternalOpenPath
  if (externalOpenPath) enqueueExternalOpenPath(externalOpenPath)
  activateMainWindowFromEvent()
})
```

Preserve startup diagnostics and log both initial and second-instance external-open paths.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
bun run test -- src/main/windows-cli-project-open.test.ts src/main/main.test.ts src/main/external-open.test.ts src/web/lib/open-repo-paths.test.ts
git add -- src/main/main.ts src/main/main.test.ts
git commit -m "feat(windows): deliver hob imports to running app"
```

### Task 4: Add a safe user-PATH transformer

**Files:**

- Create: `src/system/windows-user-path.test.ts`
- Create: `build/windows-user-path.ps1`

- [ ] **Step 1: Write failing transformation tests**

Invoke `powershell.exe` with `-TransformOnly` and parse the compact JSON. Assert:

```ts
expect(transform('Add', entry, '')).toEqual({ Changed: true, Value: entry })
expect(transform('Add', entry, `C:\\Tools;${entry}`)).toEqual({
  Changed: false,
  Value: `C:\\Tools;${entry}`,
})
expect(transform('Add', entry, `C:\\Tools;${entry.toUpperCase()}\\`)).toMatchObject({ Changed: false })
expect(transform('Remove', entry, `C:\\Tools;${entry};C:\\Other`)).toEqual({
  Changed: true,
  Value: 'C:\\Tools;C:\\Other',
})
expect(transform('Remove', entry, `C:\\Tools;${entry}-other`)).toMatchObject({ Changed: false })
```

Also assert the source uses `[EnvironmentVariableTarget]::User`, exposes `TransformOnly`, and never contains `setx`.

- [ ] **Step 2: Verify RED**

```powershell
bun run test -- src/system/windows-user-path.test.ts
```

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement the transformer**

Create `build/windows-user-path.ps1` with mandatory `-Action Add|Remove`, mandatory `-Entry`, optional `-TransformOnly`, and optional `-PathValue`. Its comparison function must trim whitespace and quotes, normalize `/` to `\`, remove trailing separators beyond a drive root, and compare with `OrdinalIgnoreCase`. Preserve original unrelated segments. Transform-only mode prints `{ Changed, Value }` as compact JSON. Registry mode reads and writes only `EnvironmentVariableTarget::User`. Exit 0 when changed, 10 when unchanged, and 1 with `hob PATH update failed: ...` on failure.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
bun run test -- src/system/windows-user-path.test.ts
git add -- build/windows-user-path.ps1 src/system/windows-user-path.test.ts
git commit -m "feat(windows): add safe hob PATH transformer"
```

### Task 5: Package the launcher and install PATH

**Files:**

- Create: `build/installer.nsh`
- Modify: `electron-builder.ts`
- Verify/Modify: `src/system/build-script.test.ts`

- [ ] **Step 1: Verify existing packaging assertions are RED**

The repository already asserts that packaging includes `{ from: 'bin/hob.cmd', to: 'bin/hob.cmd' }`, `nsis.include` is `build/installer.nsh`, and the include defines install/uninstall hooks, Add/Remove actions, `$INSTDIR\resources\bin`, and `WM_SETTINGCHANGE`.

```powershell
bun run test -- src/system/build-script.test.ts
```

Expected: FAIL because the Windows resource and custom include are absent.

- [ ] **Step 2: Implement NSIS hooks**

Create `build/installer.nsh` with:

```nsh
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!macro HandleHobUserPathResult
  Pop $0
  Pop $1
  ${If} $0 == 0
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${ElseIf} $0 != 10
    DetailPrint "Hobgoblin user PATH update failed (exit $0): $1"
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Hobgoblin could not update your user PATH.$\r$\n$\r$\n$1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  File /oname=$PLUGINSDIR\windows-user-path.ps1 "${PROJECT_DIR}\build\windows-user-path.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\windows-user-path.ps1" -Action "Add" -Entry "$INSTDIR\resources\bin"'
  !insertmacro HandleHobUserPathResult
!macroend

!macro customUnInstall
  File /oname=$PLUGINSDIR\windows-user-path.ps1 "${PROJECT_DIR}\build\windows-user-path.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\windows-user-path.ps1" -Action "Remove" -Entry "$INSTDIR\resources\bin"'
  !insertmacro HandleHobUserPathResult
!macroend
```

- [ ] **Step 3: Configure packaging**

Change `electron-builder.ts` to:

```ts
extraResources: [
  { from: 'bin/hob', to: 'bin/hob' },
  { from: 'bin/hob.cmd', to: 'bin/hob.cmd' },
],
```

and add:

```ts
include: 'build/installer.nsh',
```

to the existing `nsis` object.

- [ ] **Step 4: Verify GREEN and package**

```powershell
bun run test -- src/system/windows-user-path.test.ts src/system/build-script.test.ts src/system/hob-cli-windows.test.ts
bun run build:web
bun run build:electron -- --win nsis --x64 --config.npmRebuild=false
```

Expected: focused tests pass and electron-builder emits an x64 NSIS installer without include errors.

- [ ] **Step 5: Commit**

```powershell
git add -- build/installer.nsh electron-builder.ts
git commit -m "feat(windows): install hob command on user PATH"
```

### Task 6: Document Windows usage

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Modify: `docs/index.html`

- [ ] **Step 1: Verify existing documentation assertions are RED**

The existing build-script suite requires every README to contain `PowerShell`, `Get-Command hob -All`, and `where.exe hob`; website assertions require all four localized labels to describe macOS and Windows.

```powershell
bun run test -- src/system/build-script.test.ts
```

Expected: documentation assertions fail because current copy calls `hob` macOS-only.

- [ ] **Step 2: Update documentation**

Change each Magic Operations label from macOS-only to macOS and Windows. Insert a localized Windows section immediately before the existing macOS terminal section. Each section must state that the installer adds `resources\bin` to current-user PATH, requires a newly opened terminal, shows:

```powershell
hob .
Get-Command hob -All
where.exe hob
```

and explains that zero arguments default to the current directory.

Update `docs/index.html` and its English, Chinese, Korean, and Japanese translation entries so the label says “Open the current project from a macOS or Windows terminal” in the corresponding language.

- [ ] **Step 3: Verify GREEN and commit**

```powershell
bun run test -- src/system/build-script.test.ts
git add -- README.md README.zh-CN.md README.ja.md README.ko.md docs/index.html
git commit -m "docs(windows): explain hob terminal setup"
```

### Task 7: Verify the complete contract

- [ ] **Step 1: Run focused behavior tests**

```powershell
bun run test -- src/system/hob-cli-windows.test.ts src/system/windows-user-path.test.ts src/main/windows-cli-project-open.test.ts src/main/main.test.ts src/main/external-open.test.ts src/web/lib/open-repo-paths.test.ts src/system/build-script.test.ts
```

- [ ] **Step 2: Run repository gates**

```powershell
bun run typecheck
bun run test
bun run check:architecture
bun run format:check
git diff --check
```

- [ ] **Step 3: Audit packaged output**

```powershell
Test-Path release\win-unpacked\resources\bin\hob.cmd
Get-ChildItem release -Filter 'Hobgoblin-*-x64.exe'
```

- [ ] **Step 4: Audit requirements and worktree scope**

```powershell
git status --short
git log -10 --oneline
```

Map fresh evidence to zero-argument `hob`, `hob .`, explicit directory import, first launch, running instance, spaces, path validation, PATH idempotence, uninstall cleanup, and macOS compatibility.

## Architecture grill result

- **Native boundary:** Only `src/main` reads Electron argv. The parser stays pure and imports neither `src/web` nor `src/server`.
- **Project lifecycle:** CLI code transports a path only. It never probes repositories, writes recent projects, or calls the embedded server; `openRepoPaths` and `ensureWorkspaceOpen` remain authoritative.
- **State ownership:** No new restorable or runtime-coherent state is introduced. The existing external-open intent wakes the renderer, which projects server-owned repository truth normally.
- **Realtime:** An occasional queued native intent remains sufficient; adding a WebSocket channel or polling would duplicate the established path.
- **First-instance race:** The path is carried in lock data and queued only after the process owns the single-instance lock, before renderer initialization.
- **Running-instance race:** The `second-instance` handler prefers `additionalData`, queues before activation, and continues using the activation barrier.
- **Windows path fidelity:** The batch launcher quotes the one resolved path, the argv parser returns it unchanged, and `enqueueExternalOpenPath` performs final native-boundary validation.
- **Installer safety:** PATH changes are user-scoped, exact-entry based, case-insensitive for comparison, idempotent, reversible, and independent of shell profile files.
- **Uninstall safety:** Removal targets only the current installation's `resources\bin` entry and never deletes prefix matches or unrelated entries.
- **Packaging:** Both launchers stay outside ASAR; macOS packaging and document-open behavior remain unchanged.

The repository references `.claude/skills/grill-with-docs/SKILL.md`, but that file is absent in the current worktree. This recorded grill is the manual fallback against `docs/arch.md`, `docs/layering.md`, `docs/state-sync.md`, `docs/renderer-model.md`, and `docs/realtime.md`.

## Plan self-review

- Every design success criterion maps to a task and fresh verification commands.
- File and symbol names are consistent across tests, implementation, packaging, documentation, and audit steps.
- No placeholder, second project-import path, new dependency, unsupported TypeScript construct, or unrelated refactor remains.
