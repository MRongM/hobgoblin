# Windows Blank Screen Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows packaged builds diagnosable and prevent silent blank windows, then verify packaged startup on GitHub Actions Windows runners.

**Architecture:** Add a small main-process startup diagnostics module, wire it into embedded-server and window startup boundaries, and add a Windows packaged smoke step to the temporary test workflow. Keep diagnostics in `src/main/**`, keep HTTP serving in `src/server/**`, and use CI to validate Windows runtime behavior that macOS cannot prove.

**Tech Stack:** Electron 42, Node.js 24 strip-only TypeScript, Bun 1.3.11, Vitest, GitHub Actions `windows-latest`, electron-builder NSIS/unpacked output.

**Repository Constraint:** Do not plan or execute git commits unless the user explicitly requests them. Use verification checkpoints instead of commit steps.

---

## File Structure

- Create `src/main/startup-diagnostics.ts`
  - Owns startup log path resolution, safe append-only logging, secret redaction, and plain-text error formatting.
- Create `src/main/startup-diagnostics.test.ts`
  - Verifies redaction, log line format, and safe fallback behavior.
- Create `src/main/startup-error-page.ts`
  - Owns the self-contained HTML shown when the normal renderer cannot load.
- Create `src/main/startup-error-page.test.ts`
  - Verifies escaping and inclusion of phase/log path/message.
- Modify `src/main/server-manager.ts`
  - Logs packaged startup metadata, server command, redacted environment summary, child stdout/stderr, exit, errors, and readiness failures.
- Modify `src/main/window.ts`
  - Logs renderer URL creation/load lifecycle and shows the fallback error page on initial renderer load failure.
- Modify `src/main/window.test.ts`
  - Extends existing BrowserWindow mocks and verifies fallback behavior.
- Modify `.github/workflows/windows-test.yml`
  - Adds Windows packaged startup smoke after artifact build and uploads startup logs on failure.
- Optionally modify `src/main/server-manager.test.ts`
  - Adds server entry/working-directory expectations if diagnostics reveal an entry-path root cause.

---

### Task 1: Add Startup Diagnostics Module

**Files:**
- Create: `src/main/startup-diagnostics.ts`
- Create: `src/main/startup-diagnostics.test.ts`

- [ ] **Step 1: Write failing tests for redaction and log formatting**

Create `src/main/startup-diagnostics.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  appendFileSync: mocks.appendFileSync,
  mkdirSync: mocks.mkdirSync,
}))

describe('startup diagnostics', () => {
  test('redacts sensitive server values before writing log lines', async () => {
    const { formatStartupLogLine } = await import('#/main/startup-diagnostics.ts')

    const line = formatStartupLogLine('server-command', {
      bin: 'Hobgoblin.exe',
      secret: 'super-secret-value',
      GOBLIN_SERVER_INTERNAL_SECRET: 'env-secret',
      nested: { clientSecret: 'nested-secret' },
    })

    expect(line).toContain('[server-command]')
    expect(line).toContain('"bin":"Hobgoblin.exe"')
    expect(line).not.toContain('super-secret-value')
    expect(line).not.toContain('env-secret')
    expect(line).not.toContain('nested-secret')
    expect(line).toContain('"secret":"[redacted]"')
    expect(line).toContain('"GOBLIN_SERVER_INTERNAL_SECRET":"[redacted]"')
    expect(line).toContain('"clientSecret":"[redacted]"')
  })

  test('creates the diagnostics directory and appends one line per event', async () => {
    const { createStartupDiagnostics } = await import('#/main/startup-diagnostics.ts')
    const diagnostics = createStartupDiagnostics('/tmp/Hobgoblin/startup.log')

    diagnostics.log('renderer-url', { url: 'http://127.0.0.1:32200/' })

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/tmp/Hobgoblin', { recursive: true })
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1)
    expect(mocks.appendFileSync.mock.calls[0]?.[0]).toBe('/tmp/Hobgoblin/startup.log')
    expect(String(mocks.appendFileSync.mock.calls[0]?.[1])).toContain('[renderer-url]')
  })
})
```

- [ ] **Step 2: Run the focused failing test**

Run:

```sh
bun run test src/main/startup-diagnostics.test.ts
```

Expected: fail because `src/main/startup-diagnostics.ts` does not exist.

- [ ] **Step 3: Implement diagnostics module**

Create `src/main/startup-diagnostics.ts`:

```ts
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

type StartupLogPayload = Record<string, unknown>

export interface StartupDiagnostics {
  readonly logPath: string
  log(event: string, payload?: StartupLogPayload): void
}

const SECRET_KEY_PATTERN = /secret|token|password|credential/i

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]'
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry))
  if (value && typeof value === 'object') return redactObject(value)
  return value
}

function redactObject(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactValue(key, entry)])
  return Object.fromEntries(entries)
}

export function formatStartupLogLine(event: string, payload: StartupLogPayload = {}): string {
  const timestamp = new Date().toISOString()
  const safePayload = redactObject(payload)
  return `${timestamp} [${event}] ${JSON.stringify(safePayload)}\n`
}

export function createStartupDiagnostics(logPath: string): StartupDiagnostics {
  return {
    logPath,
    log(event, payload = {}) {
      try {
        mkdirSync(path.dirname(logPath), { recursive: true })
        appendFileSync(logPath, formatStartupLogLine(event, payload), 'utf8')
      } catch (error) {
        console.warn('[startup] failed to write diagnostics', error)
      }
    },
  }
}
```

- [ ] **Step 4: Verify diagnostics tests pass**

Run:

```sh
bun run test src/main/startup-diagnostics.test.ts
```

Expected: pass.

---

### Task 2: Add Non-Blank Startup Error Page

**Files:**
- Create: `src/main/startup-error-page.ts`
- Create: `src/main/startup-error-page.test.ts`
- Modify: `src/main/window.ts`
- Modify: `src/main/window.test.ts`

- [ ] **Step 1: Write failing tests for HTML escaping**

Create `src/main/startup-error-page.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

describe('startup error page', () => {
  test('renders escaped startup failure details', async () => {
    const { buildStartupErrorPageHtml } = await import('#/main/startup-error-page.ts')

    const html = buildStartupErrorPageHtml({
      phase: 'renderer-load',
      message: '<script>alert(1)</script>',
      logPath: 'C:\\Users\\test\\AppData\\Roaming\\Hobgoblin\\startup.log',
    })

    expect(html).toContain('Hobgoblin failed to start')
    expect(html).toContain('renderer-load')
    expect(html).toContain('C:\\Users\\test\\AppData\\Roaming\\Hobgoblin\\startup.log')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
```

- [ ] **Step 2: Run the focused failing test**

Run:

```sh
bun run test src/main/startup-error-page.test.ts
```

Expected: fail because `src/main/startup-error-page.ts` does not exist.

- [ ] **Step 3: Implement startup error page module**

Create `src/main/startup-error-page.ts`:

```ts
interface StartupErrorPageOptions {
  phase: string
  message: string
  logPath: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildStartupErrorPageHtml({ phase, message, logPath }: StartupErrorPageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Hobgoblin startup failed</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f8; color: #1f2328; }
      main { width: min(720px, calc(100vw - 48px)); }
      h1 { font-size: 22px; margin: 0 0 12px; }
      p { line-height: 1.5; margin: 8px 0; }
      code { display: block; margin-top: 8px; padding: 10px 12px; border-radius: 6px; background: #eaecf0; overflow-wrap: anywhere; }
      @media (prefers-color-scheme: dark) {
        body { background: #161618; color: #f0f0f2; }
        code { background: #24262b; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hobgoblin failed to start</h1>
      <p>Startup phase: <strong>${escapeHtml(phase)}</strong></p>
      <p>${escapeHtml(message)}</p>
      <p>Diagnostic log:</p>
      <code>${escapeHtml(logPath)}</code>
    </main>
  </body>
</html>`
}
```

- [ ] **Step 4: Wire fallback page into initial renderer load failure**

Modify `src/main/window.ts`:

```ts
import path from 'node:path'
import { buildStartupErrorPageHtml } from '#/main/startup-error-page.ts'
import { createStartupDiagnostics } from '#/main/startup-diagnostics.ts'
```

Add near constants:

```ts
function startupDiagnostics() {
  return createStartupDiagnostics(path.join(app.getPath('userData'), 'startup.log'))
}

async function showStartupErrorPage(win: BrowserWindow, phase: string, error: unknown): Promise<void> {
  const diagnostics = startupDiagnostics()
  const message = error instanceof Error ? error.message : String(error)
  diagnostics.log('startup-error-page', { phase, message, logPath: diagnostics.logPath })
  const html = buildStartupErrorPageHtml({ phase, message, logPath: diagnostics.logPath })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}
```

Replace the existing `try/catch` around `win.loadURL(url.toString())`:

```ts
  try {
    diagnostics.log('renderer-load-start', { url: url.toString() })
    await win.loadURL(url.toString())
    diagnostics.log('renderer-load-complete', { url: url.toString() })
  } catch (err) {
    console.warn('[window] failed to load app URL', err)
    await showStartupErrorPage(win, 'renderer-load', err)
  }
```

Also register renderer lifecycle diagnostics before load:

```ts
  const diagnostics = startupDiagnostics()
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    diagnostics.log('renderer-did-fail-load', { errorCode, errorDescription, validatedURL })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    diagnostics.log('renderer-process-gone', details)
    void showStartupErrorPage(win, 'renderer-process', new Error(details.reason)).catch(() => {})
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2) return
    diagnostics.log('renderer-console', { level, message, line, sourceId })
  })
```

- [ ] **Step 5: Extend window test mock and verify fallback**

Modify `src/main/window.test.ts` mock window to include `loadURL` calls for data URLs. Add:

```ts
  test('shows a startup error page when the initial renderer URL load fails', async () => {
    mocks.loadURL.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce(undefined)
    const { getOrCreateMainWindow } = await import('#/main/window.ts')

    await getOrCreateMainWindow()

    expect(mocks.loadURL).toHaveBeenCalledTimes(2)
    expect(String(mocks.loadURL.mock.calls[1]?.[0])).toContain('data:text/html')
    expect(decodeURIComponent(String(mocks.loadURL.mock.calls[1]?.[0]))).toContain('renderer-load')
  })
```

If the diagnostics module writes to disk in this test, mock `#/main/startup-diagnostics.ts`:

```ts
vi.mock('#/main/startup-diagnostics.ts', () => ({
  createStartupDiagnostics: () => ({ logPath: '/tmp/Hobgoblin/startup.log', log: vi.fn() }),
}))
```

- [ ] **Step 6: Verify focused tests**

Run:

```sh
bun run test src/main/startup-error-page.test.ts src/main/window.test.ts
```

Expected: pass.

---

### Task 3: Instrument Embedded Server Startup

**Files:**
- Modify: `src/main/server-manager.ts`
- Modify: `src/main/server-manager.test.ts`

- [ ] **Step 1: Add tests for packaged entry metadata**

Modify `src/main/server-manager.test.ts`:

```ts
describe('embedded server packaged diagnostics', () => {
  test('resolves packaged server metadata without exposing secrets', async () => {
    const { resolveEmbeddedServerEntryPath } = await import('#/main/server-manager.ts')
    const appPath = path.join('C:\\Program Files\\Hobgoblin\\resources', 'app.asar')

    expect(resolveEmbeddedServerEntryPath(appPath)).toBe(
      path.join(appPath, 'src/server/entrypoints/main.ts'),
    )
  })
})
```

Keep this expectation until Windows smoke diagnostics prove the source TypeScript entry is the root cause. Do not change entry resolution speculatively.

- [ ] **Step 2: Log startup metadata and child process output**

Modify `src/main/server-manager.ts` imports:

```ts
import { createStartupDiagnostics } from '#/main/startup-diagnostics.ts'
```

Add helper:

```ts
function diagnostics() {
  return createStartupDiagnostics(path.join(app.getPath('userData'), 'startup.log'))
}
```

In `pipeProcessLogs`, append diagnostics:

```ts
function pipeProcessLogs(proc: ServerChildProcess): void {
  const log = diagnostics()
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', (chunk) => {
    const output = chunk.trim()
    if (output) {
      console.log(`[server] ${output}`)
      log.log('server-stdout', { output })
    }
  })
  proc.stderr.on('data', (chunk) => {
    const output = chunk.trim()
    if (output) {
      console.error(`[server] ${output}`)
      log.log('server-stderr', { output })
    }
  })
}
```

In `startEmbeddedServer`, before `spawn`:

```ts
    const log = diagnostics()
    log.log('embedded-server-start', {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      processExecPath: process.execPath,
      entry: command.args[0],
      cwd: serverWorkingDirectory(),
      host,
      port,
    })
```

In process handlers:

```ts
    proc.once('exit', (code, signal) => {
      log.log('embedded-server-exit', { code, signal })
      if (serverProcess === proc) serverProcess = null
      runtime = null
    })
    proc.once('error', (error) => {
      log.log('embedded-server-process-error', { message: error.message, name: error.name })
      console.error('[server] process failed', error)
    })
```

Around readiness:

```ts
      await waitForServer(url, SERVER_READY_TIMEOUT_MS)
      runtime = { host, port, url, secret, clientId }
      log.log('embedded-server-ready', { url, host, port, clientId })
      console.log(`[server] ready at ${url}`)
      return runtime
    } catch (error) {
      log.log('embedded-server-ready-failed', {
        url,
        message: error instanceof Error ? error.message : String(error),
      })
      await stopEmbeddedServer()
      throw error
    }
```

- [ ] **Step 3: Run focused tests**

Run:

```sh
bun run test src/main/server-manager.test.ts src/main/startup-diagnostics.test.ts
```

Expected: pass.

---

### Task 4: Add Windows Packaged Startup Smoke to Temporary Workflow

**Files:**
- Modify: `.github/workflows/windows-test.yml`

- [ ] **Step 1: Add smoke step after build**

Add after `Build Windows artifact` and before `Upload Windows artifact`:

```yaml
      - name: Smoke test packaged Windows app startup
        shell: pwsh
        env:
          GOBLIN_SMOKE_USER_DATA: ${{ runner.temp }}\hobgoblin-smoke-user-data
        run: |
          $ErrorActionPreference = "Stop"
          $exe = Get-ChildItem -Path "release" -Recurse -Filter "Hobgoblin.exe" | Select-Object -First 1
          if (-not $exe) {
            Write-Host "Could not find unpacked Hobgoblin.exe. Release tree:"
            Get-ChildItem -Path "release" -Recurse | Select-Object FullName
            throw "Missing unpacked Hobgoblin.exe for smoke test"
          }

          $userData = $env:GOBLIN_SMOKE_USER_DATA
          New-Item -ItemType Directory -Force -Path $userData | Out-Null
          $env:APPDATA = $userData
          $env:LOCALAPPDATA = $userData
          $env:GOBLIN_SERVER_PORT = "0"

          $process = Start-Process -FilePath $exe.FullName -PassThru
          $logPath = Join-Path $userData "Hobgoblin\startup.log"
          $deadline = (Get-Date).AddSeconds(45)
          $ready = $false

          while ((Get-Date) -lt $deadline) {
            if ($process.HasExited) {
              break
            }
            if (Test-Path $logPath) {
              $log = Get-Content $logPath -Raw
              if ($log -match "renderer-load-complete") {
                $ready = $true
                break
              }
              if ($log -match "startup-error-page|renderer-did-fail-load|renderer-process-gone|embedded-server-ready-failed") {
                break
              }
            }
            Start-Sleep -Milliseconds 500
          }

          if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
          }

          if (Test-Path $logPath) {
            Get-Content $logPath
          } else {
            Write-Host "Startup log was not created at $logPath"
          }

          if (-not $ready) {
            throw "Packaged Windows app did not complete renderer startup smoke"
          }
```

- [ ] **Step 2: Upload smoke logs on failure**

Add after the smoke step:

```yaml
      - name: Upload Windows startup smoke logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: hobgoblin-windows-startup-logs-${{ github.sha }}
          path: ${{ runner.temp }}\hobgoblin-smoke-user-data\Hobgoblin\startup.log
          if-no-files-found: warn
          retention-days: 7
```

- [ ] **Step 3: Verify workflow syntax locally**

Run:

```sh
sed -n '1,220p' ".github/workflows/windows-test.yml"
```

Expected: `Smoke test packaged Windows app startup` appears between build and artifact upload.

---

### Task 5: Run Full Local Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```sh
bun run test src/main/startup-diagnostics.test.ts src/main/startup-error-page.test.ts src/main/window.test.ts src/main/server-manager.test.ts
```

Expected: pass.

- [ ] **Step 2: Run standard project checks**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all pass.

- [ ] **Step 3: Review changed files**

Run:

```sh
git status --short --branch
git diff --stat
```

Expected: changed files are limited to startup diagnostics/error page code, tests, workflow, and this plan/spec. Existing unrelated `README.md` modifications remain untouched.

---

### Task 6: Push Windows Smoke and Classify the Root Cause

**Files:**
- No new files unless the smoke run identifies a precise root-cause fix.

- [ ] **Step 1: Ask for push approval**

Before pushing, show:

```text
⚠️ 危险操作检测！
操作类型：git push + GitHub Actions Windows 构建/启动验证
影响范围：推送 windows 分支并触发 Windows Test Build；会消耗 Actions runner。
风险评估：不会合并 main，不会发布 GitHub Release；会更新远端 windows 分支。

请确认是否继续？[需要明确的"是"、"确认"、"继续"]
```

- [ ] **Step 2: Push after approval**

Run only after explicit approval:

```sh
git push origin "windows"
```

Expected: push succeeds and triggers `Windows Test Build`.

- [ ] **Step 3: Watch the run**

Run:

```sh
gh run list --workflow "Windows Test Build" --branch "windows" --limit 3
gh run watch "<run-id>" --exit-status
```

Expected: either pass, or fail with uploaded `startup.log`.

- [ ] **Step 4: Classify smoke result**

If smoke passes:

- Windows blank screen is likely fixed by diagnostics/load handling or was intermittent.
- Download artifact and manually test once on Windows.

If smoke fails before `embedded-server-ready`:

- Root cause is embedded server startup.
- Inspect `startup.log` for entry path, cwd, child stderr, and readiness failure.
- Then modify `resolveEmbeddedServerEntryPath` to prefer `dist/server/main.js` in packaged mode only if the log proves the TypeScript entry is failing.

If smoke reaches `embedded-server-ready` but fails before `renderer-load-complete`:

- Root cause is renderer URL load or renderer process failure.
- Use `did-fail-load`, `console-message`, and `render-process-gone` log entries to fix the failing renderer/static asset path.

If smoke reaches `renderer-load-complete` but manual Windows still shows blank:

- Add a renderer first-paint readiness marker in a follow-up task, because `loadURL` alone does not prove React rendered.

---

## Self-Review

- Spec coverage: diagnostics, non-blank failure UI, Windows CI smoke, macOS-vs-Windows validation limits, and root-cause classification are covered.
- Placeholder scan: no unresolved placeholder markers are present.
- Type consistency: planned modules use `StartupDiagnostics`, `buildStartupErrorPageHtml`, and existing `BrowserWindow`/Vitest patterns consistently.
- Scope check: signing, release publishing, updater work, and unrelated Windows path support are excluded.
