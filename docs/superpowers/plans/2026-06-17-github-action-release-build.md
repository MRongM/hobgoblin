# GitHub Action Release Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually triggered GitHub Actions release workflow that builds macOS arm64 DMG, macOS x64 DMG, and Windows x64 NSIS installer assets, then uploads them to the `v<package.json version>` GitHub Release.

**Architecture:** Keep local install/build behavior in `scripts/build.ts` unchanged. Add `scripts/build-release-artifacts.ts` as a CI-only packaging entry point, add Windows NSIS output to `electron-builder.ts`, and use `.github/workflows/release.yml` to orchestrate platform builds plus Release publishing.

**Tech Stack:** Bun 1.3.11, TypeScript in Node strip-only mode, Electron, electron-builder, GitHub Actions, GitHub CLI, Vitest.

**Project override:** Do not add git commit steps. `AGENTS.md` says not to plan or execute git commits unless the user explicitly asks.

---

## File Structure

- Modify `src/system/build-script.test.ts`
  - Owns text/config regression coverage for desktop build scripts and release workflow configuration.
- Modify `electron-builder.ts`
  - Adds the smallest Windows x64 NSIS packaging configuration while preserving existing macOS settings.
- Create `scripts/build-release-artifacts.ts`
  - CI-focused build entry point for exactly one platform/architecture pair per invocation.
  - Builds web/server bundles, runs `electron-builder`, and validates the expected asset.
- Create `.github/workflows/release.yml`
  - Manual-only release workflow.
  - Builds macOS arm64, macOS x64, and Windows x64 assets.
  - Creates or updates `v<version>` and uploads assets with overwrite behavior.

### Task 1: Add Failing Release Configuration Tests

**Files:**

- Modify: `src/system/build-script.test.ts`

- [ ] **Step 1: Add imports for file existence and electron-builder config**

Change the first import from:

```ts
import { readFileSync } from 'node:fs'
```

to:

```ts
import { existsSync, readFileSync } from 'node:fs'
```

Add this import after the Vitest import:

```ts
import electronBuilderConfig from '../../electron-builder.ts'
```

- [ ] **Step 2: Add local config inspection types**

Add this interface after `readText`:

```ts
interface DesktopBuilderConfig {
  win?: {
    target?: unknown
    artifactName?: string
  }
  nsis?: {
    oneClick?: boolean
    perMachine?: boolean
    allowToChangeInstallationDirectory?: boolean
  }
}
```

- [ ] **Step 3: Add failing workflow and release artifact tests**

Append these tests inside `describe('desktop build scripts', () => { ... })`:

```ts
test('manual release workflow builds macOS and Windows artifacts then publishes release assets', () => {
  const workflowPath = path.join(repoRoot, '.github/workflows/release.yml')

  expect(existsSync(workflowPath)).toBe(true)

  const workflow = readText('.github/workflows/release.yml')

  expect(workflow).toContain('workflow_dispatch:')
  expect(workflow).not.toContain('push:')
  expect(workflow).not.toContain('pull_request:')
  expect(workflow).toContain('contents: write')
  expect(workflow).toContain('build-macos:')
  expect(workflow).toContain('build-windows:')
  expect(workflow).toContain('publish:')
  expect(workflow).toContain('bun-version: 1.3.11')
  expect(workflow).toContain('bun install --frozen-lockfile')
  expect(workflow).toContain('bun run typecheck')
  expect(workflow).toContain('bun scripts/build-release-artifacts.ts --platform macos --arch ${{ matrix.arch }}')
  expect(workflow).toContain('bun scripts/build-release-artifacts.ts --platform windows --arch x64')
  expect(workflow).toContain('actions/upload-artifact@v4')
  expect(workflow).toContain('actions/download-artifact@v4')
  expect(workflow).toContain('GITHUB_SHA')
  expect(workflow).toContain('gh release create "$TAG" --target "$GITHUB_SHA"')
  expect(workflow).toContain('gh release upload "$TAG"')
  expect(workflow).toContain('--clobber')
  expect(workflow).toContain('Hobgoblin-${VERSION}-arm64.dmg')
  expect(workflow).toContain('Hobgoblin-${VERSION}-x64.dmg')
  expect(workflow).toContain('Hobgoblin-${VERSION}-x64.exe')
})

test('release artifact script validates platform-specific standard artifact names', () => {
  const releaseScriptPath = path.join(repoRoot, 'scripts/build-release-artifacts.ts')

  expect(existsSync(releaseScriptPath)).toBe(true)

  const releaseScript = readText('scripts/build-release-artifacts.ts')

  expect(releaseScript).toContain("const APP_NAME = 'Hobgoblin'")
  expect(releaseScript).toContain("type ReleasePlatform = 'macos' | 'windows'")
  expect(releaseScript).toContain("type ReleaseArch = 'arm64' | 'x64'")
  expect(releaseScript).toContain("macos: ['arm64', 'x64']")
  expect(releaseScript).toContain("windows: ['x64']")
  expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.dmg`')
  expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.exe`')
  expect(releaseScript).toContain("path.join(repoRoot, 'release', expectedArtifactName(version, platform, arch))")
  expect(releaseScript).toContain('bun run build:web')
  expect(releaseScript).toContain('bun run build:server')
  expect(releaseScript).toContain('bun run build:electron')
})

test('desktop release packaging config includes Windows x64 NSIS output', () => {
  const config = electronBuilderConfig as unknown as DesktopBuilderConfig

  expect(config.win?.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
  expect(config.win?.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
  expect(config.nsis?.oneClick).toBe(false)
  expect(config.nsis?.perMachine).toBe(false)
  expect(config.nsis?.allowToChangeInstallationDirectory).toBe(true)
})
```

- [ ] **Step 4: Run the focused tests and verify they fail**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: FAIL. The failures should mention missing `.github/workflows/release.yml`, missing `scripts/build-release-artifacts.ts`, and missing Windows NSIS config.

### Task 2: Add Windows NSIS Packaging Configuration

**Files:**

- Modify: `electron-builder.ts`
- Test: `src/system/build-script.test.ts`

- [ ] **Step 1: Add Windows config to electron-builder**

In `electron-builder.ts`, add this block after the existing `mac` block and before the closing `}` of `config`:

```ts
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
```

The resulting tail of the config should look like this:

```ts
  mac: {
    category: 'public.app-category.developer-tools',
    extendInfo: {
      // Required for macOS to show Hobgoblin in System Settings → Notifications
      // and to allow Banner/Alert style notifications. Without this key the
      // app either won't appear in the notification list at all, or will be
      // locked to the silent "None" style with no user-visible controls.
      NSUserNotificationAlertStyle: 'alert',
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Folder',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.folder'],
        },
      ],
    },
    // electron-builder organizes builds by arch, so any `dir` here would be
    // emitted for every arch declared on dmg. `build.ts install` picks the
    // host-arch directory out of `release/mac*/` itself.
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'dir', arch: ['arm64', 'x64'] },
    ],
    identity: null,
    // Force arch into the filename. electron-builder's default omits the
    // suffix on x64, which would make `Hobgoblin-0.1.0.dmg` (intel) and
    // `Hobgoblin-0.1.0-arm64.dmg` (apple silicon) sort next to each other in
    // releases with no hint of which is which.
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
}
```

- [ ] **Step 2: Run only the Windows config test**

Run:

```sh
bun run test src/system/build-script.test.ts -t "desktop release packaging config includes Windows x64 NSIS output"
```

Expected: PASS.

- [ ] **Step 3: Run the focused build-script suite**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: FAIL only on the missing workflow and missing release artifact script tests.

### Task 3: Add CI Release Artifact Script

**Files:**

- Create: `scripts/build-release-artifacts.ts`
- Test: `src/system/build-script.test.ts`

- [ ] **Step 1: Create the release artifact build script**

Create `scripts/build-release-artifacts.ts` with this content:

```ts
#!/usr/bin/env bun
// Build one standard release artifact for the current CI runner.
// Usage: bun scripts/build-release-artifacts.ts --platform macos --arch arm64
//        bun scripts/build-release-artifacts.ts --platform macos --arch x64
//        bun scripts/build-release-artifacts.ts --platform windows --arch x64
import { $ } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = path.resolve(import.meta.dirname, '..')
process.chdir(repoRoot)
$.cwd(repoRoot)

const APP_NAME = 'Hobgoblin'

type ReleasePlatform = 'macos' | 'windows'
type ReleaseArch = 'arm64' | 'x64'

const SUPPORTED_ARCHES: Record<ReleasePlatform, ReleaseArch[]> = {
  macos: ['arm64', 'x64'],
  windows: ['x64'],
}

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    arch: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parsePlatform(value: string | undefined): ReleasePlatform {
  if (value === 'macos' || value === 'windows') return value
  fail(`Error: --platform must be "macos" or "windows", got ${JSON.stringify(value)}.`)
}

function parseArch(value: string | undefined): ReleaseArch {
  if (value === 'arm64' || value === 'x64') return value
  fail(`Error: --arch must be "arm64" or "x64", got ${JSON.stringify(value)}.`)
}

function assertSupported(platform: ReleasePlatform, arch: ReleaseArch): void {
  if (SUPPORTED_ARCHES[platform].includes(arch)) return
  fail(`Error: unsupported release target ${platform}/${arch}.`)
}

function assertHostCanBuild(platform: ReleasePlatform): void {
  if (platform === 'macos' && process.platform !== 'darwin') {
    fail('Error: macOS release artifacts must be built on a macOS runner.')
  }
  if (platform === 'windows' && process.platform !== 'win32') {
    fail('Error: Windows release artifacts must be built on a Windows runner.')
  }
}

function expectedArtifactName(version: string, platform: ReleasePlatform, arch: ReleaseArch): string {
  if (platform === 'macos') return `${APP_NAME}-${version}-${arch}.dmg`
  return `${APP_NAME}-${version}-${arch}.exe`
}

function assertFileExists(relativePath: string): void {
  const filePath = path.join(repoRoot, relativePath)
  if (existsSync(filePath)) return
  fail(`Error: expected build artifact missing: ${relativePath}`)
}

const platform = parsePlatform(values.platform)
const arch = parseArch(values.arch)
assertSupported(platform, arch)
assertHostCanBuild(platform)

const { version } = (await Bun.file(path.join(repoRoot, 'package.json')).json()) as {
  version: string
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Error: package.json version must be semver-like, got ${JSON.stringify(version)}.`)
}

rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })

await $`bun run build:web`
await $`bun run build:server`

assertFileExists('dist/web/index.html')
assertFileExists('dist/web/boot.js')
assertFileExists('dist/server/main.js')
assertFileExists('dist/server/terminal-worker.js')

const platformArgs = platform === 'macos' ? ['--mac', 'dmg'] : ['--win', 'nsis']
const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
await $`bun run build:electron -- ${platformArgs} ${archFlag}`

const artifactPath = path.join(repoRoot, 'release', expectedArtifactName(version, platform, arch))
if (!existsSync(artifactPath)) {
  fail(`Error: expected release artifact missing: ${path.relative(repoRoot, artifactPath)}`)
}

console.log(`Built release artifact: ${path.relative(repoRoot, artifactPath)}`)
```

- [ ] **Step 2: Run only the release script text test**

Run:

```sh
bun run test src/system/build-script.test.ts -t "release artifact script validates platform-specific standard artifact names"
```

Expected: PASS.

- [ ] **Step 3: Typecheck the new script**

Run:

```sh
bun run typecheck
```

Expected: PASS for `tsconfig.main.json`, `tsconfig.web.json`, and `tsconfig.test.json`.

- [ ] **Step 4: Run the focused build-script suite**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: FAIL only on the missing workflow test.

### Task 4: Add Manual GitHub Release Workflow

**Files:**

- Create: `.github/workflows/release.yml`
- Test: `src/system/build-script.test.ts`

- [ ] **Step 1: Create the workflow directory**

Create the `.github/workflows` directory if it does not exist.

- [ ] **Step 2: Create the release workflow**

Create `.github/workflows/release.yml` with this content:

````yaml
name: Release

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-macos:
    name: Build macOS ${{ matrix.arch }}
    runs-on: macos-14
    strategy:
      fail-fast: false
      matrix:
        arch: [arm64, x64]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Build release artifact
        run: bun scripts/build-release-artifacts.ts --platform macos --arch ${{ matrix.arch }}

      - name: Upload macOS artifact
        uses: actions/upload-artifact@v4
        with:
          name: hobgoblin-macos-${{ matrix.arch }}
          path: release/Hobgoblin-*-${{ matrix.arch }}.dmg
          if-no-files-found: error

  build-windows:
    name: Build Windows x64
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Build release artifact
        run: bun scripts/build-release-artifacts.ts --platform windows --arch x64

      - name: Upload Windows artifact
        uses: actions/upload-artifact@v4
        with:
          name: hobgoblin-windows-x64
          path: release/Hobgoblin-*-x64.exe
          if-no-files-found: error

  publish:
    name: Publish GitHub Release
    runs-on: ubuntu-latest
    needs: [build-macos, build-windows]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - name: Resolve package version
        id: version
        shell: bash
        run: |
          VERSION="$(bun -e "const pkg = await Bun.file('package.json').json(); console.log(pkg.version)")"
          if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
            echo "Invalid package.json version: $VERSION" >&2
            exit 1
          fi
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "tag=v$VERSION" >> "$GITHUB_OUTPUT"

      - name: Download release assets
        uses: actions/download-artifact@v4
        with:
          path: release-assets
          merge-multiple: true

      - name: Validate release assets
        shell: bash
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          EXPECTED=(
            "Hobgoblin-${VERSION}-arm64.dmg"
            "Hobgoblin-${VERSION}-x64.dmg"
            "Hobgoblin-${VERSION}-x64.exe"
          )

          for asset in "${EXPECTED[@]}"; do
            if [[ ! -f "release-assets/$asset" ]]; then
              echo "Missing release asset: $asset" >&2
              find release-assets -maxdepth 2 -type f -print >&2
              exit 1
            fi
          done

      - name: Write release notes
        shell: bash
        run: |
          cat > release-notes.md <<'NOTES'
          Unsigned builds.

          macOS: Gatekeeper may block unsigned downloads. After installing, run:

          ```sh
          xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
          ```

          Or right-click the app, choose Open, then confirm Open.

          Windows: SmartScreen may warn on unsigned installers. Continue only if you trust this GitHub Release source.
          NOTES

      - name: Create or update GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          TAG="${{ steps.version.outputs.tag }}"
          if gh release view "$TAG" >/dev/null 2>&1; then
            gh release edit "$TAG" --title "$TAG" --notes-file release-notes.md
          else
            gh release create "$TAG" --target "$GITHUB_SHA" --title "$TAG" --notes-file release-notes.md
          fi

      - name: Upload release assets
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          TAG="${{ steps.version.outputs.tag }}"
          gh release upload "$TAG" \
            "release-assets/Hobgoblin-${VERSION}-arm64.dmg" \
            "release-assets/Hobgoblin-${VERSION}-x64.dmg" \
            "release-assets/Hobgoblin-${VERSION}-x64.exe" \
            --clobber
````

- [ ] **Step 3: Run only the workflow test**

Run:

```sh
bun run test src/system/build-script.test.ts -t "manual release workflow builds macOS and Windows artifacts then publishes release assets"
```

Expected: PASS.

- [ ] **Step 4: Run the focused build-script suite**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: PASS.

### Task 5: Run Project Verification

**Files:**

- Verify: all changed files

- [ ] **Step 1: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected: PASS with `[typecheck] all projects passed`.

- [ ] **Step 2: Run architecture guard**

Run:

```sh
bun run check:architecture
```

Expected: PASS with `[architecture] import boundaries passed`.

- [ ] **Step 3: Run full test suite**

Run:

```sh
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect changed files**

Run:

```sh
git status --short
```

Expected changed files:

- `electron-builder.ts` modified.
- `src/system/build-script.test.ts` modified.
- `.github/workflows/release.yml` added.
- `scripts/build-release-artifacts.ts` added.
- `docs/superpowers/specs/2026-06-17-github-action-release-build-design.md` present as an untracked design document unless the user asks to commit it.
- `docs/superpowers/plans/2026-06-17-github-action-release-build.md` present as an untracked plan document unless the user asks to commit it.

- [ ] **Step 5: Manual CI validation after pushing through the user's normal process**

In GitHub Actions, run the `Release` workflow manually.

Expected Release state for `package.json` version `0.1.0`:

```text
v0.1.0
Hobgoblin-0.1.0-arm64.dmg
Hobgoblin-0.1.0-x64.dmg
Hobgoblin-0.1.0-x64.exe
```

If the version changes before validation, replace `0.1.0` with the current `package.json` version.

## Self-Review

- Spec coverage: manual trigger, version-derived tag, macOS arm64/x64 DMGs, Windows x64 NSIS EXE, unsigned notes, idempotent upload, focused tests, and local build isolation all map to tasks above.
- Placeholder scan: no placeholder requirements remain.
- Type consistency: `ReleasePlatform`, `ReleaseArch`, workflow job names, artifact names, and test expectations use the same spellings throughout.
