# Install Script Timings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print default per-stage timing diagnostics for `./install.sh` without changing build, install, signing, cleanup, or restart behavior.

**Architecture:** Keep `install.sh` as a thin wrapper and add timing inside `scripts/build.ts`, where the expensive work actually runs. Use a small `formatDuration` formatter and a generic `timeStep` wrapper around existing build/install stages; keep tests as focused static script assertions, matching the current `src/system/build-script.test.ts` style.

**Tech Stack:** Bun, TypeScript in strip-only mode, Electron Builder, Vitest.

---

## Planning Notes

Do not add git commit steps to this plan. The repository instructions say not to plan or execute git commits unless the user explicitly requests them.

The implementation should avoid unsupported strip-only TypeScript features:

- no enums
- no parameter properties
- no namespaces with runtime code
- no import aliases

## File Structure

- Modify: `src/system/build-script.test.ts`
  - Responsibility: static coverage that build/install scripts keep the intended behavior and instrumentation.
- Modify: `scripts/build.ts`
  - Responsibility: build, package, install, and now print timing diagnostics for each major stage.

No new runtime files are needed. No changes are required in `install.sh` because timings are default behavior and all expensive steps live in `scripts/build.ts`.

### Task 1: Add Failing Static Coverage For Timing Instrumentation

**Files:**
- Modify: `src/system/build-script.test.ts`

- [ ] **Step 1: Add the timing instrumentation test**

Append this test inside the existing `describe('desktop build scripts', () => { ... })` block in `src/system/build-script.test.ts`:

```ts
  test('build script prints timing diagnostics for install stages', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain('function formatDuration(ms: number): string')
    expect(buildScript).toContain('async function timeStep<T>(')
    expect(buildScript).toContain('skipped in ${duration}')
    expect(buildScript).toContain("console.log(`[timing] total: ${formatDuration(Date.now() - totalStartedAt)}`)")

    expect(buildScript).toContain("await timeStep('prepare output'")
    expect(buildScript).toContain("await timeStep('bun install check'")
    expect(buildScript).toContain("await timeStep('bun install', () => $`bun install`)")
    expect(buildScript).toContain("await timeStep('bun install', () => {")
    expect(buildScript).toContain("await timeStep('node-pty helper check'")
    expect(buildScript).toContain("await timeStep('typecheck', () => $`bun run typecheck`)")
    expect(buildScript).toContain("await timeStep('typecheck', () => {")
    expect(buildScript).toContain("await timeStep('build:web', () => $`bun run build:web`)")
    expect(buildScript).toContain("await timeStep('build:server', () => $`bun run build:server`)")
    expect(buildScript).toContain("await timeStep('artifact check'")
    expect(buildScript).toContain("await timeStep('electron-builder', () => $`bun run build:electron -- ${builderArgs}`)")
    expect(buildScript).toContain("await timeStep('close running app', () => closeRunningApp())")
    expect(buildScript).toContain("await timeStep('install app'")
    expect(buildScript).toContain("await timeStep('codesign', () => $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`)")
    expect(buildScript).toContain("await timeStep('cleanup release'")
  })
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```sh
bun test src/system/build-script.test.ts
```

Expected result: the new test fails because `scripts/build.ts` does not yet define `formatDuration`, `timeStep`, or timing-wrapped stages.

### Task 2: Add Timing Helpers And Preserve Failure Semantics

**Files:**
- Modify: `scripts/build.ts`

- [ ] **Step 1: Add script failure and timing helpers**

In `scripts/build.ts`, after `shouldRunBunInstall()` and before the build steps begin, add:

```ts
class BuildScriptFailure extends Error {
  exitCode: number

  constructor(exitCode = 1) {
    super('build script failed')
    this.exitCode = exitCode
  }
}

function fail(message: string): never {
  console.error(message)
  throw new BuildScriptFailure()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

async function timeStep<T>(
  label: string,
  action: () => T | Promise<T>,
  options: { skipped?: boolean } = {},
): Promise<T> {
  const startedAt = Date.now()
  try {
    return await action()
  } finally {
    const duration = formatDuration(Date.now() - startedAt)
    const detail = options.skipped === true ? `skipped in ${duration}` : duration
    console.log(`[timing] ${label}: ${detail}`)
  }
}
```

This helper uses a normal class field instead of a constructor parameter property, keeping the file compatible with Node.js strip-only TypeScript.

- [ ] **Step 2: Wrap the current script body in `main()` with total timing**

Move the existing top-level build/install body, starting at the comment `// Clear any prior build output...` through the end of the file, into:

```ts
async function main(): Promise<void> {
  await timeStep('prepare output', () => {
    rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
    if (shouldClean) {
      rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true })
    }
  })

  const needsBunInstall = await timeStep('bun install check', () => shouldRunBunInstall())
  if (needsBunInstall) {
    await timeStep('bun install', () => $`bun install`)
  } else {
    await timeStep(
      'bun install',
      () => {
        console.log('Skipping bun install (node_modules is up to date).')
      },
      { skipped: true },
    )
  }

  await timeStep('node-pty helper check', () => {
    if (process.platform !== 'darwin') return

    const ptySpawnHelperArches = [process.arch]
    const ptySpawnHelpers = ptySpawnHelperArches.map((arch) =>
      path.join(repoRoot, 'node_modules/node-pty/prebuilds', `darwin-${arch}`, 'spawn-helper'),
    )
    const missingPtySpawnHelpers = ptySpawnHelpers.filter((helper) => !existsSync(helper))
    if (missingPtySpawnHelpers.length > 0) {
      fail(`Error: missing node-pty darwin spawn-helper(s): ${missingPtySpawnHelpers.join(', ')}`)
    }
    for (const helper of ptySpawnHelpers) {
      chmodSync(helper, 0o755)
    }
  })

  if (shouldRunTypecheck) {
    await timeStep('typecheck', () => $`bun run typecheck`)
  } else {
    await timeStep(
      'typecheck',
      () => {
        console.log('Skipping typecheck for fast install.')
      },
      { skipped: true },
    )
  }

  await timeStep('build:web', () => $`bun run build:web`)
  await timeStep('build:server', () => $`bun run build:server`)

  await timeStep('artifact check', () => {
    const webDist = path.join(repoRoot, 'dist/web')
    for (const artifact of [path.join(webDist, 'index.html'), path.join(webDist, 'boot.js')]) {
      if (!existsSync(artifact)) {
        fail(`Error: web build artifact missing: ${artifact}`)
      }
    }
    const serverDistEntry = path.join(repoRoot, 'dist/server/main.js')
    if (!existsSync(serverDistEntry)) {
      fail(`Error: server build artifact missing: ${serverDistEntry}`)
    }
    const terminalWorkerDistEntry = path.join(repoRoot, 'dist/server/terminal-worker.js')
    if (!existsSync(terminalWorkerDistEntry)) {
      fail(`Error: server build artifact missing: ${terminalWorkerDistEntry}`)
    }
  })

  const archFlag = process.arch === 'arm64' ? '--arm64' : '--x64'
  const electronBuilderConfigArgs = shouldInstall ? ['--config.npmRebuild=false'] : []
  const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]
  await timeStep('electron-builder', () => $`bun run build:electron -- ${builderArgs}`)

  const srcApp = await findBuiltApp()
  if (!srcApp) {
    fail(`Error: could not find built ${APP_NAME}.app under release/`)
  }
  console.log(`Built: ${path.relative(repoRoot, srcApp)}`)

  if (!shouldInstall) return

  if (process.platform !== 'darwin') {
    fail('install mode is macOS-only')
  }

  console.log(`Installing ${APP_NAME}.app to ~/Applications...`)

  await timeStep('close running app', () => closeRunningApp())

  const appsDir = path.join(os.homedir(), 'Applications')
  const destApp = path.join(appsDir, `${APP_NAME}.app`)
  await timeStep('install app', () => {
    mkdirSync(appsDir, { recursive: true })
    rmSync(destApp, { recursive: true, force: true })
    renameSync(srcApp, destApp)
    console.log(`Installed: ${destApp}`)
  })

  console.log('Re-signing with correct bundle identifier...')
  await timeStep('codesign', () => $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`)
  console.log('Re-signed.')

  await timeStep('cleanup release', () => {
    rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
    console.log('Done.')
  })
}

const totalStartedAt = Date.now()
try {
  await main()
} catch (error) {
  if (error instanceof BuildScriptFailure) {
    process.exitCode = error.exitCode
  } else {
    throw error
  }
} finally {
  console.log(`[timing] total: ${formatDuration(Date.now() - totalStartedAt)}`)
}
```

Keep the existing explanatory comments near their corresponding steps:

- release cleanup comment above `prepare output`
- renderer bundle comment above `build:web`
- `dir` target comment above `builderArgs`
- app closing comment above `closeRunningApp`
- codesigning explanation above the `codesign` step

- [ ] **Step 3: Remove duplicate top-level statements**

After wrapping the body in `main()`, ensure `scripts/build.ts` has no remaining duplicate top-level calls to:

```ts
rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
await $`bun install`
await $`bun run build:web`
await $`bun run build:server`
await $`bun run build:electron -- ${builderArgs}`
await $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`
```

Each of those operations should now be inside a `timeStep(...)` call.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```sh
bun test src/system/build-script.test.ts
```

Expected result: all tests in `src/system/build-script.test.ts` pass.

### Task 3: Verify Type Safety And Script Test Suite

**Files:**
- Verify only

- [ ] **Step 1: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected result: pass with exit code 0.

- [ ] **Step 2: Run the full test suite**

Run:

```sh
bun run test
```

Expected result: pass with exit code 0.

- [ ] **Step 3: Review changed files**

Run:

```sh
git diff -- scripts/build.ts src/system/build-script.test.ts docs/superpowers/plans/2026-06-15-install-script-timings.md docs/superpowers/specs/2026-06-15-install-script-timings-design.md
```

Expected result:

- `scripts/build.ts` contains timing helpers and `timeStep(...)` wrappers.
- `src/system/build-script.test.ts` contains the new timing instrumentation test.
- The plan and spec remain documentation-only changes.
- No unrelated files are modified by this task.

### Task 4: Optional Manual Install Timing Verification

**Files:**
- Verify only

This task requires explicit user approval because `./install.sh` can close and replace `~/Applications/Hobgoblin.app`.

- [ ] **Step 1: Request approval before running install**

Use the required dangerous-operation confirmation format before running:

```sh
./install.sh
```

The confirmation must state:

- operation type: local app build/install
- impact range: closes running `Hobgoblin.app`, replaces `~/Applications/Hobgoblin.app`, runs codesign
- risk: local app replacement and loss of current running app process state

- [ ] **Step 2: Run install only after approval**

Run:

```sh
./install.sh
```

Expected result: output includes timing lines similar to:

```text
[timing] prepare output: 4ms
[timing] bun install check: 2ms
[timing] bun install: skipped in 1ms
[timing] node-pty helper check: 3ms
[timing] typecheck: skipped in 1ms
[timing] build:web: 2.41s
[timing] build:server: 184ms
[timing] artifact check: 1ms
[timing] electron-builder: 8.73s
[timing] close running app: 503ms
[timing] install app: 327ms
[timing] codesign: 1.86s
[timing] cleanup release: 6ms
[timing] total: 14.21s
```

Exact durations will vary by machine.

## Self-Review

Spec coverage:

- Default timing output is covered by Task 2.
- Real build and install stages are instrumented in Task 2.
- Skipped stages are covered by Task 2 and tested in Task 1.
- Failure semantics are preserved by `BuildScriptFailure`, `fail()`, and `timeStep(... finally ...)` in Task 2.
- Automated real install testing is excluded and replaced with approval-gated Task 4.

Placeholder scan:

- The plan contains no incomplete placeholders.
- Every code-changing step includes concrete code.

Type consistency:

- `formatDuration(ms: number): string` and `timeStep<T>(...)` match the design spec.
- `BuildScriptFailure` avoids parameter properties and is compatible with strip-only TypeScript.
- Stage labels in tests match stage labels in implementation snippets.
