# Primary Windows Release Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Windows x64 and ARM64 installers from the primary root application while retaining the independent Windows package only as a separately named test build.

**Architecture:** Generalize the root single-artifact release script and Electron Builder configuration to support native Windows NSIS output. Keep `.github/workflows/windows-test.yml` as the reusable native-runner boundary, but make its always-on matrix build and smoke-test root `src/`; the Release caller explicitly sets `official_release: true` to suppress the independent-package matrix, so Release downloads cannot receive independent installers.

**Tech Stack:** Bun 1.3.11, TypeScript strip-only mode, Vitest 4, Electron 42, electron-builder 26, GitHub Actions, PowerShell.

## Global Constraints

- Official Windows assets are `Hobgoblin-<version>-x64.exe` and `Hobgoblin-<version>-arm64.exe` built from root `src/`.
- Build x64 on `windows-latest` and ARM64 on `windows-11-arm`; do not cross-compile native dependencies.
- Preserve the existing macOS artifact behavior and filenames.
- Preserve the existing packaged startup and internal-terminal smoke for both official Windows architectures.
- Do not migrate independent-only `hob.cmd` PATH integration into the root installer.
- Keep independent-package artifacts explicitly named `independent` and unavailable to reusable Release calls.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and avoid strip-only-unsupported TypeScript syntax.
- Add no dependencies.
- Do not run `git commit`, `git push`, a GitHub Actions dispatch, or release-asset replacement.

---

## File structure

- `scripts/build-release-artifacts.ts` — parses one root platform/architecture request, derives native builder arguments and exact output name, then builds one artifact.
- `scripts/build-release-artifacts.test.ts` — unit-tests platform parsing, native-host validation, Electron Builder arguments, and exact artifact naming.
- `electron-builder.ts` — owns root macOS and Windows packaging configuration plus the shared ConPTY restoration hook.
- `src/system/build-script.test.ts` — locks root package configuration, reusable workflow ownership, matrix runners, smoke, and publication paths.
- `scripts/windows-package-layout.test.ts` — retains independent package isolation while asserting it no longer owns official release packaging.
- `.github/workflows/windows-test.yml` — produces smoke-tested primary installers for reusable Release calls and separately named independent test artifacts for standalone events.
- `package.json`, `windows/package.json`, `android/app/build.gradle.kts`, `docs/index.html` — coordinate the new v2.2.8 release identity without moving the published v2.2.7 tag.
- `docs/releases/v2.2.7.md` — records that the historical Windows download came from the independent package.
- `docs/releases/v2.2.8.md` — publishes the fix as a new release whose Windows downloads use the primary application build.
- `windows/README.md` — clarifies that package-local builds are not official GitHub Release assets.
- `src/system/release-documentation.test.ts` — prevents documentation from assigning official release ownership back to the independent package.
- `CONTEXT.md`, `docs/adr/0004-independent-windows-platform-package.md`, `docs/adr/0005-publish-primary-application-windows-artifacts.md` — already capture the approved domain language and superseding decision; verify them with the implementation.

### Task 1: Root Windows release packaging contract

**Files:**

- Create: `scripts/build-release-artifacts.test.ts`
- Modify: `scripts/build-release-artifacts.ts`
- Modify: `electron-builder.ts`
- Modify: `src/system/build-script.test.ts`
- Modify: `scripts/windows-package-layout.test.ts`

**Interfaces:**

- Produces: `ReleasePlatform = 'macos' | 'windows'`.
- Produces: `ReleaseArch = 'arm64' | 'x64'`.
- Produces: `parseReleaseArguments(args: string[]): { platform: ReleasePlatform; arch: ReleaseArch }`.
- Produces: `createReleaseArtifactPlan(platform: ReleasePlatform, arch: ReleaseArch, version: string): ReleaseArtifactPlan`.
- Produces: `assertReleaseHost(platform: ReleasePlatform, host: NodeJS.Platform): void`.
- `ReleaseArtifactPlan` has exact fields `builderArgs: string[]`, `artifactName: string`, and `requiredHost: 'darwin' | 'win32'`.
- Consumes: root `package.json` version, root Vite renderer output, and root `electron-builder.ts`.

- [ ] **Step 1: Write failing release-plan tests**

Create `scripts/build-release-artifacts.test.ts` with table-driven assertions:

```ts
import { describe, expect, test } from 'vitest'
import { assertReleaseHost, createReleaseArtifactPlan, parseReleaseArguments } from './build-release-artifacts.ts'

describe('parseReleaseArguments', () => {
  test.each([
    ['macos', 'arm64'],
    ['macos', 'x64'],
    ['windows', 'arm64'],
    ['windows', 'x64'],
  ] as const)('accepts %s/%s', (platform, arch) => {
    expect(parseReleaseArguments(['--platform', platform, '--arch', arch])).toEqual({ platform, arch })
  })

  test('rejects unsupported platform and architecture values', () => {
    expect(() => parseReleaseArguments(['--platform', 'linux', '--arch', 'x64'])).toThrow(
      '--platform must be "macos" or "windows"',
    )
    expect(() => parseReleaseArguments(['--platform', 'windows', '--arch', 'ia32'])).toThrow(
      '--arch must be "arm64" or "x64"',
    )
  })
})

describe('createReleaseArtifactPlan', () => {
  test('creates the existing macOS DMG plan', () => {
    expect(createReleaseArtifactPlan('macos', 'arm64', '2.2.7')).toEqual({
      requiredHost: 'darwin',
      builderArgs: ['--mac', 'dmg', '--arm64', '--publish', 'never'],
      artifactName: 'Hobgoblin-2.2.7-arm64.dmg',
    })
  })

  test('creates an architecture-qualified Windows NSIS plan', () => {
    expect(createReleaseArtifactPlan('windows', 'x64', '2.2.7')).toEqual({
      requiredHost: 'win32',
      builderArgs: ['--win', 'nsis', '--x64', '--publish', 'never'],
      artifactName: 'Hobgoblin-2.2.7-x64.exe',
    })
  })
})

describe('assertReleaseHost', () => {
  test('accepts only the native host for each release platform', () => {
    expect(() => assertReleaseHost('macos', 'darwin')).not.toThrow()
    expect(() => assertReleaseHost('windows', 'win32')).not.toThrow()
    expect(() => assertReleaseHost('windows', 'darwin')).toThrow(
      'Windows release artifacts must be built on a Windows runner',
    )
  })
})
```

In `src/system/build-script.test.ts`, replace the macOS-only root release/config assertions with assertions for both platform plans and this exact Windows configuration:

```ts
expect(config.win).toMatchObject({
  target: [{ target: 'nsis', arch: ['arm64', 'x64'] }],
  artifactName: '${productName}-${version}-${arch}.${ext}',
})
expect(config.nsis).toEqual({
  oneClick: false,
  perMachine: false,
  allowToChangeInstallationDirectory: true,
})
```

In `scripts/windows-package-layout.test.ts`, replace the assertion that root packaging excludes Windows with:

```ts
test('keeps independent outputs isolated while root owns official Windows release packaging', () => {
  const repoRoot = path.resolve(windowsRoot, '..')
  const rootBuilderConfig = readFileSync(path.join(repoRoot, 'electron-builder.ts'), 'utf8')
  const rootReleaseScript = readFileSync(path.join(repoRoot, 'scripts', 'build-release-artifacts.ts'), 'utf8')

  expect(rootBuilderConfig).toMatch(/^\s*win:\s*\{/m)
  expect(rootReleaseScript).toContain("'windows'")
  expect(rootReleaseScript).toContain("['--win', 'nsis'")
})
```

- [ ] **Step 2: Run the targeted tests and verify red state**

Run:

```sh
bun run test -- scripts/build-release-artifacts.test.ts src/system/build-script.test.ts scripts/windows-package-layout.test.ts
```

Expected: FAIL because the exported release-plan helpers and root `win`/`nsis` configuration do not exist and old macOS-only assertions still describe the superseded boundary.

- [ ] **Step 3: Implement the minimal root release-plan API**

Refactor `scripts/build-release-artifacts.ts` so importing it has no build side effects. Define the exact public model and keep execution behind `import.meta.main`:

```ts
export type ReleasePlatform = 'macos' | 'windows'
export type ReleaseArch = 'arm64' | 'x64'

export interface ReleaseArtifactPlan {
  requiredHost: 'darwin' | 'win32'
  builderArgs: string[]
  artifactName: string
}

export function parseReleaseArguments(args: string[]): {
  platform: ReleasePlatform
  arch: ReleaseArch
} {
  const { values } = parseArgs({
    args,
    options: {
      platform: { type: 'string' },
      arch: { type: 'string' },
    },
  })
  if (values.platform !== 'macos' && values.platform !== 'windows') {
    throw new Error(`--platform must be "macos" or "windows", got ${JSON.stringify(values.platform)}`)
  }
  if (values.arch !== 'arm64' && values.arch !== 'x64') {
    throw new Error(`--arch must be "arm64" or "x64", got ${JSON.stringify(values.arch)}`)
  }
  return { platform: values.platform, arch: values.arch }
}

export function createReleaseArtifactPlan(
  platform: ReleasePlatform,
  arch: ReleaseArch,
  version: string,
): ReleaseArtifactPlan {
  const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
  const platformArgs = platform === 'macos' ? ['--mac', 'dmg'] : ['--win', 'nsis']
  const extension = platform === 'macos' ? 'dmg' : 'exe'
  return {
    requiredHost: platform === 'macos' ? 'darwin' : 'win32',
    builderArgs: [...platformArgs, archFlag, '--publish', 'never'],
    artifactName: `Hobgoblin-${version}-${arch}.${extension}`,
  }
}

export function assertReleaseHost(platform: ReleasePlatform, host: NodeJS.Platform): void {
  const expected = platform === 'macos' ? 'darwin' : 'win32'
  if (host === expected) return
  throw new Error(
    platform === 'macos'
      ? 'macOS release artifacts must be built on a macOS runner.'
      : 'Windows release artifacts must be built on a Windows runner.',
  )
}
```

The guarded `main()` must:

```ts
async function main(): Promise<void> {
  const { platform, arch } = parseReleaseArguments(process.argv.slice(2))
  assertReleaseHost(platform, process.platform)
  const { version } = (await Bun.file(path.join(repoRoot, 'package.json')).json()) as { version: string }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`package.json version must be semver-like, got ${JSON.stringify(version)}.`)
  }

  const plan = createReleaseArtifactPlan(platform, arch, version)
  rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
  await $`bun ${viteCli} build`
  assertFileExists('dist/web/index.html')
  assertFileExists('dist/web/boot.js')
  await $`bun ${electronBuilderCli} ${plan.builderArgs}`
  assertFileExists(path.join('release', plan.artifactName))
  console.log(`Built release artifact: ${path.join('release', plan.artifactName)}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: Add root Windows Electron Builder configuration**

Add to the root `electron-builder.ts` configuration after `mac`:

```ts
win: {
  target: [{ target: 'nsis', arch: ['arm64', 'x64'] }],
  artifactName: '${productName}-${version}-${arch}.${ext}',
},
nsis: {
  oneClick: false,
  perMachine: false,
  allowToChangeInstallationDirectory: true,
},
```

Do not add `windows/build/installer.nsh`, `windows/bin/hob.cmd`, or its PATH mutation to the root package.

- [ ] **Step 5: Run targeted tests and verify green state**

Run:

```sh
bun run test -- scripts/build-release-artifacts.test.ts src/system/build-script.test.ts scripts/windows-package-layout.test.ts
```

Expected: PASS, including unchanged macOS release-plan coverage and both root Windows architectures.

### Task 2: Reusable workflow publishes only primary installers

**Files:**

- Modify: `src/system/build-script.test.ts`
- Modify: `.github/workflows/windows-test.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: `bun scripts/build-release-artifacts.ts --platform windows --arch <x64|arm64>` from Task 1.
- Produces: `hobgoblin-primary-windows-${arch}-${github.sha}` containing `release/Hobgoblin-*-${arch}.exe`.
- Produces outside reusable calls: `hobgoblin-independent-windows-${arch}-${github.sha}` containing `windows/release/Hobgoblin-*-${arch}.exe`.
- Preserves: the existing PowerShell packaged startup and terminal smoke behavior.

- [ ] **Step 1: Replace old workflow ownership assertions with failing primary-release assertions**

Update the two workflow tests in `src/system/build-script.test.ts` to require:

```ts
expect(windowsWorkflow).toContain('workflow_call:')
expect(windowsWorkflow).not.toContain('include_primary:')
expect(windowsWorkflow).toContain('build-primary-windows:')
expect(windowsWorkflow).toContain('name: Build primary application Windows ${{ matrix.arch }}')
expect(windowsWorkflow).toContain('bun scripts/build-release-artifacts.ts --platform windows --arch ${{ matrix.arch }}')
expect(windowsWorkflow).toContain('name: hobgoblin-primary-windows-${{ matrix.arch }}-${{ github.sha }}')
expect(windowsWorkflow).toContain('path: release/Hobgoblin-*-${{ matrix.arch }}.exe')
expect(windowsWorkflow).toContain('build-independent-windows:')
expect(windowsWorkflow).toContain('if: ${{ inputs.official_release != true }}')
expect(releaseWorkflow).toContain('official_release: true')
expect(windowsWorkflow).toContain('name: hobgoblin-independent-windows-${{ matrix.arch }}-${{ github.sha }}')
expect(windowsWorkflow).toContain('path: windows/release/Hobgoblin-*-${{ matrix.arch }}.exe')
expect(windowsWorkflow).toContain('$releaseRoot = Join-Path $env:GITHUB_WORKSPACE "release"')
expect(windowsWorkflow).not.toContain('$releaseRoot = Join-Path $env:GITHUB_WORKSPACE "windows/release"')
```

Keep assertions for `fail-fast: false`, both native runners, the smoke markers, failure-log upload, both final `.exe` names in `.github/workflows/release.yml`, and `--clobber`.

- [ ] **Step 2: Run the workflow contract test and verify red state**

Run:

```sh
bun run test -- src/system/build-script.test.ts
```

Expected: FAIL because the reusable job still builds `windows/`, the primary build is conditional x64-only, and the smoke searches `windows/release`.

- [ ] **Step 3: Make the primary build the always-on native matrix**

Change the workflow triggers to remove `include_primary` and include official-source paths:

```yaml
on:
  workflow_call:
    inputs:
      official_release:
        required: false
        type: boolean
        default: false
  workflow_dispatch:
  pull_request:
    paths:
      - .github/workflows/release.yml
      - .github/workflows/windows-test.yml
      - bun.lock
      - electron-builder.ts
      - package.json
      - scripts/build-release-artifacts.ts
      - src/**
      - tsconfig*.json
      - vite.config.ts
      - windows/**
  push:
    branches:
      - main
      - windows
    paths:
      - .github/workflows/release.yml
      - .github/workflows/windows-test.yml
      - bun.lock
      - electron-builder.ts
      - package.json
      - scripts/build-release-artifacts.ts
      - src/**
      - tsconfig*.json
      - vite.config.ts
      - windows/**
```

Replace the conditional x64 directory job with a primary matrix using the existing native runner mapping. Its pre-smoke steps must be:

```yaml
build-primary-windows:
  name: Build primary application Windows ${{ matrix.arch }}
  strategy:
    fail-fast: false
    matrix:
      include:
        - arch: x64
          runner: windows-latest
        - arch: arm64
          runner: windows-11-arm
  runs-on: ${{ matrix.runner }}
  steps:
    - name: Checkout
      uses: actions/checkout@v4
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: 24
    - name: Setup Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version: 1.3.11
    - name: Install dependencies
      run: bun install --frozen-lockfile
    - name: Typecheck primary application
      run: bun run typecheck
    - name: Test primary Windows compatibility
      run: >-
        bun run test --
        --testTimeout=15000
        scripts/build-release-artifacts.test.ts
        scripts/windows-package-layout.test.ts
        src/server/terminal/terminal-pty-runtime.test.ts
        src/server/terminal/windows-terminal-shell.test.ts
        src/shared/file-path-target.test.ts
        src/shared/path-semantics.test.ts
        src/shared/worktree-guards.test.ts
        src/system/windows-terminal.test.ts
        src/web/components/terminal/terminal-path-links.test.ts
        src/web/lib/editor-open-targets.test.ts
        src/web/lib/paths.test.ts
    - name: Build primary Windows artifact
      id: build_artifact
      run: bun scripts/build-release-artifacts.ts --platform windows --arch ${{ matrix.arch }}
```

Move the existing `Smoke test packaged Windows app startup` PowerShell step under this job without changing its functions or terminal assertions. Change only its package root lookup:

```powershell
$releaseRoot = Join-Path $env:GITHUB_WORKSPACE "release"
```

Use primary-specific failure and artifact uploads:

```yaml
- name: Upload primary Windows startup smoke logs
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: hobgoblin-primary-windows-startup-logs-${{ matrix.arch }}-${{ github.sha }}
    path: ${{ runner.temp }}\Hobgoblin Smoke 用户 Data\**\*
    if-no-files-found: warn
    retention-days: 7
- name: Upload primary Windows artifact
  if: ${{ !cancelled() && steps.build_artifact.outcome == 'success' }}
  uses: actions/upload-artifact@v4
  with:
    name: hobgoblin-primary-windows-${{ matrix.arch }}-${{ github.sha }}
    path: release/Hobgoblin-*-${{ matrix.arch }}.exe
    if-no-files-found: error
    retention-days: 7
```

- [ ] **Step 4: Retain independent builds only for standalone test events**

Add a separate independent matrix guarded by the explicit typed input. Do not infer this boundary from `github.event_name`, because reusable workflows inherit their caller's GitHub context:

```yaml
build-independent-windows:
  if: ${{ inputs.official_release != true }}
  name: Test independent Windows ${{ matrix.arch }}
  strategy:
    fail-fast: false
    matrix:
      include:
        - arch: x64
          runner: windows-latest
        - arch: arm64
          runner: windows-11-arm
  runs-on: ${{ matrix.runner }}
```

Under it, retain checkout, Node 24, Bun 1.3.11, root/windows version equality, `windows/` dependency install, package typecheck, the existing independent compatibility-test list, `bun run build:release -- --arch ${{ matrix.arch }}` with `working-directory: windows`, and this upload:

```yaml
- name: Upload independent Windows test artifact
  if: ${{ !cancelled() && steps.build_artifact.outcome == 'success' }}
  uses: actions/upload-artifact@v4
  with:
    name: hobgoblin-independent-windows-${{ matrix.arch }}-${{ github.sha }}
    path: windows/release/Hobgoblin-*-${{ matrix.arch }}.exe
    if-no-files-found: error
    retention-days: 7
```

Do not duplicate the packaged smoke in this non-release job; the smoke gate belongs to the official primary installers.

- [ ] **Step 5: Run workflow contract tests and verify green state**

Run:

```sh
bun run test -- src/system/build-script.test.ts scripts/windows-package-layout.test.ts scripts/build-release-artifacts.test.ts
```

Expected: PASS. Inspect `.github/workflows/release.yml` and confirm its publish job still downloads merged artifacts, requires both `.exe` names, and uploads those exact names with `--clobber`.

### Task 3: Align release documentation with primary ownership

**Files:**

- Modify: `src/system/release-documentation.test.ts`
- Modify: `package.json`
- Modify: `windows/package.json`
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidIdentityContractTest.kt`
- Modify: `docs/index.html`
- Modify: `docs/releases/v2.2.7.md`
- Create: `docs/releases/v2.2.8.md`
- Modify: `windows/README.md`
- Verify: `CONTEXT.md`
- Verify: `docs/adr/0004-independent-windows-platform-package.md`
- Verify: `docs/adr/0005-publish-primary-application-windows-artifacts.md`

**Interfaces:**

- Consumes: the official/independent terms defined in `CONTEXT.md`.
- Produces: release and package copy that assigns official Windows assets only to the primary application.

- [ ] **Step 1: Add failing documentation ownership assertions**

In `src/system/release-documentation.test.ts`, add:

```ts
test('assigns official Windows release artifacts to the primary application', () => {
  const context = readText('CONTEXT.md')
  const releaseNotes = readText('docs/releases/v2.2.8.md')
  const independentReadme = readText('windows/README.md')

  expect(context).toContain('**Official Windows release artifact**:')
  expect(context).toContain('built from the primary application Windows version')
  expect(releaseNotes).toContain('built from the primary application')
  expect(releaseNotes).not.toContain('matching behavior in the independent Windows version')
  expect(independentReadme).toContain('not the source of official GitHub Release Windows installers')
})
```

- [ ] **Step 2: Run the documentation test and verify red state**

Run:

```sh
bun run test -- src/system/release-documentation.test.ts
```

Expected: FAIL because the v2.2.8 notes do not exist yet and `windows/README.md` still presents an unqualified release command.

- [ ] **Step 3: Update release and independent-package copy**

Set root and independent package versions to `2.2.8`, increment Android to `versionCode = 10` / `versionName = "2.2.8"`, and update the Pages release badge. The coordinated package versions satisfy the existing Release workflow guard even though only the root package owns official Windows installers.

Keep `docs/releases/v2.2.7.md` historically accurate by recording that its Windows assets came from the independent package. Create `docs/releases/v2.2.8.md` with the new release boundary:

```md
The Windows x64 and ARM64 installers now package the primary root application from the same release commit as macOS.
```

List all six v2.2.8 assets, retain unsigned-build warnings, and link the `v2.2.7...v2.2.8` changelog range.

After the opening paragraph of `windows/README.md`, add:

```md
This package is not the source of official GitHub Release Windows installers. Versioned Windows release assets are built from the primary application in the repository root; commands here create package-local independent Windows outputs for development and testing.
```

- [ ] **Step 4: Run documentation tests and verify green state**

Run:

```sh
bun run test -- src/system/release-documentation.test.ts scripts/windows-package-layout.test.ts
```

Expected: PASS with all six release asset names unchanged and the new ownership wording consistent with `CONTEXT.md` and ADR-0005.

### Task 4: Full verification and handoff

**Files:**

- Verify all modified files.

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: locally verified code ready for native Windows CI, without publishing or Git mutation.

- [ ] **Step 1: Run TypeScript validation**

Run:

```sh
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run the complete test suite**

Run:

```sh
bun run test
```

Expected: exit code 0 with all test files passing.

- [ ] **Step 3: Run architecture validation**

Run:

```sh
bun run check:architecture
```

Expected: exit code 0 and no forbidden main/web/server/Electron imports.

- [ ] **Step 4: Validate patch hygiene and release boundaries**

Run:

```sh
git diff --check
git status --short
```

Expected: no whitespace errors; status lists only the approved documentation, packaging, workflow, and test changes. Confirm no dependency, lockfile, generated `dist/`, or generated `release/` changes.

- [ ] **Step 5: Report native-CI follow-up without executing it**

Handoff must state that local verification cannot prove NSIS startup on macOS. The next authorized release operation is to merge/push the changes and manually dispatch Release on `main`; its x64 and ARM64 primary matrix must pass the packaged smoke before GitHub creates v2.2.8 and uploads its assets. The existing `v2.2.7` tag and assets remain unchanged so each release tag continues to identify its actual build commit.
