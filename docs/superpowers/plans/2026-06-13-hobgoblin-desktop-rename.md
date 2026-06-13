# Hobgoblin Desktop Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the PC desktop application identity from Goblin to Hobgoblin while keeping the original Goblin app installable and launchable side by side.

**Architecture:** Change desktop identity at the metadata, packaging, install, and visible-copy boundaries. Preserve internal IPC, preload, HTTP header, environment variable, CSS, and drag MIME namespaces unless they are user-visible product identity. Add focused tests for desktop identity, user-visible dictionaries, and server data-directory fallback before applying the rename.

**Tech Stack:** TypeScript, Electron, electron-builder, Bun scripts, React, Vitest, Hono server runtime.

---

## File Structure

- `package.json`: workspace package name, product name, and description.
- `bun.lock`: workspace lockfile package name after the package rename.
- `electron-builder.ts`: app id, product name, comments, and artifact naming expectations.
- `install.sh`: install restart helper app name.
- `scripts/build.ts`: packaged app name, bundle id, install path, signing id, comments, and logs.
- `scripts/close-app.ts`: packaged app close target name and path fragment.
- `scripts/publish.ts`: release artifact lookup and unsigned-build notes.
- `README.md`: product heading and desktop install/run copy.
- `src/main/main.ts`: embedded server startup dialog title.
- `src/main/desktop-identity.test.ts`: focused static identity regression coverage for package, builder config, scripts, and key UI files.
- `src/server/common/data-dir.ts`: non-Electron server-mode fallback data directory.
- `src/server/common/data-dir.test.ts`: data directory expectations.
- `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`: user-visible product copy and `open -b` examples.
- `src/shared/i18n/dictionaries.test.ts`: dictionary-level regression coverage for the Hobgoblin product name and bundle command.
- `src/web/index.html`: renderer document title and comments.
- `src/web/components/Logo.tsx`: topbar wordmark text and accessible label.
- `src/web/components/Logo.test.tsx`: focused wordmark rendering test.
- `src/web/components/settings/pages/AboutSettings.tsx`: app icon alt text.
- `src/web/renderer-bridge.ts`: user-facing bridge-unavailable errors.
- `src/web/renderer-terminal-bridge.ts`: web fallback test notification title.
- `docs/index.html`, `docs/README.md`: current product docs outside historical superpowers and Android docs.

Do not modify Android files under `android/` or `docs/android/`.

Do not rename these internal namespaces:

- `goblin:rpc`
- `goblin:event`
- `x-goblin-internal-secret`
- `window.goblinNative`
- `__GOBLIN_BOOTSTRAP__`
- `GOBLIN_SERVER_*`
- `GOBLIN_WEB_DEV_*`
- `.goblin-terminal-*`
- `application/x-goblin-file-paths+json`
- `installGoblinTestBridge`
- generic fixture paths such as `/tmp/goblin-repo`

## Task 1: Add Desktop Identity Regression Test

**Files:**
- Create: `src/main/desktop-identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/desktop-identity.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import electronBuilderConfig from '../../electron-builder.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T
}

describe('desktop identity', () => {
  test('uses the Hobgoblin package and Electron identity', () => {
    const pkg = readJson<{ name: string; productName: string; description: string }>('package.json')

    expect(pkg.name).toBe('hobgoblin')
    expect(pkg.productName).toBe('Hobgoblin')
    expect(pkg.description).toBe('Hobgoblin - Git Branch List, desktop edition')
    expect(electronBuilderConfig.appId).toBe('hobgoblin.app')
    expect(electronBuilderConfig.productName).toBe('Hobgoblin')
  })

  test('keeps desktop install and release scripts pointed at Hobgoblin only', () => {
    expect(readText('install.sh')).toContain('APP_NAME=Hobgoblin')

    const buildScript = readText('scripts/build.ts')
    expect(buildScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(buildScript).toContain("const APP_ID = 'hobgoblin.app'")
    expect(buildScript).toContain('Hobgoblin.app')
    expect(buildScript).not.toContain('Goblin.app')

    const closeScript = readText('scripts/close-app.ts')
    expect(closeScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(closeScript).toContain('/${APP_NAME}.app/Contents/MacOS/')
    expect(closeScript).not.toContain('Goblin.app')

    const publishScript = readText('scripts/publish.ts')
    expect(publishScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(publishScript).toContain('/Applications/${APP_NAME}.app')
  })

  test('keeps visible desktop entry points branded as Hobgoblin', () => {
    expect(readText('src/main/main.ts')).toContain("dialog.showErrorBox('Hobgoblin failed to start'")
    expect(readText('src/web/index.html')).toContain('<title>Hobgoblin</title>')
    expect(readText('src/web/components/settings/pages/AboutSettings.tsx')).toContain('alt="Hobgoblin"')
    expect(readText('src/web/renderer-bridge.ts')).toContain('Hobgoblin bridge is unavailable')
    expect(readText('src/web/renderer-terminal-bridge.ts')).toContain("showBrowserNotification('Hobgoblin', 'Test notification')")
  })

  test('updates lockfile workspace identity without changing dependency versions', () => {
    expect(readText('bun.lock')).toContain('"workspaces": {\n    "": {\n      "name": "hobgoblin",')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun run test -- src/main/desktop-identity.test.ts
```

Expected: FAIL. The failures should mention the current `goblin`, `Goblin`, `goblin.app`, `Goblin.app`, and `Goblin bridge is unavailable` values.

## Task 2: Rename Desktop Metadata, Packaging, Install, and Release Identity

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `electron-builder.ts`
- Modify: `install.sh`
- Modify: `scripts/build.ts`
- Modify: `scripts/close-app.ts`
- Modify: `scripts/publish.ts`
- Modify: `README.md`

- [ ] **Step 1: Update package and lockfile identity**

In `package.json`, set:

```json
{
  "name": "hobgoblin",
  "productName": "Hobgoblin",
  "description": "Hobgoblin - Git Branch List, desktop edition"
}
```

Only change those fields. Keep dependency versions pinned exactly as they are.

In `bun.lock`, change only the workspace name:

```json
"workspaces": {
  "": {
    "name": "hobgoblin",
```

- [ ] **Step 2: Update Electron builder identity**

In `electron-builder.ts`, set the config identity to:

```ts
const config: Configuration = {
  appId: 'hobgoblin.app',
  productName: 'Hobgoblin',
  icon: 'assets/icon-mac-1024.png',
```

Update comments in the same file so they refer to `Hobgoblin` and examples use `Hobgoblin-0.1.0-<arch>.dmg`.

- [ ] **Step 3: Update install script identity**

In `install.sh`, set:

```bash
APP_NAME=Hobgoblin
```

No other logic changes are needed.

- [ ] **Step 4: Update build script identity**

In `scripts/build.ts`, set:

```ts
const APP_NAME = 'Hobgoblin'
const APP_ID = 'hobgoblin.app'
```

Update comments and log text in the file so packaged app examples and notification-signing comments use `Hobgoblin`.

- [ ] **Step 5: Update close helper identity**

In `scripts/close-app.ts`, set:

```ts
// Gracefully quit a running Hobgoblin.app, force-killing if it doesn't respond.
const APP_NAME = 'Hobgoblin'
```

Update the loose-pattern comment so it says `Hobgoblin.app`.

- [ ] **Step 6: Update publish script identity**

In `scripts/publish.ts`, set:

```ts
// Publish a GitHub release for Hobgoblin. Builds macOS (.dmg for arm64 and x64),
const APP_NAME = 'Hobgoblin'
```

Leave the release artifact lookup as:

```ts
const dmgSrcs = await findAll(`release/${APP_NAME}-${version}-*.dmg`, `${APP_NAME} .dmg`, 2)
```

The unsigned-build note should continue to use:

```ts
`xattr -dr com.apple.quarantine /Applications/${APP_NAME}.app`,
```

- [ ] **Step 7: Update README product heading**

In `README.md`, change the heading to:

```md
# Hobgoblin
```

Leave the existing feature and command sections unchanged unless they refer to the old product name.

- [ ] **Step 8: Re-run the desktop identity test**

Run:

```bash
bun run test -- src/main/desktop-identity.test.ts
```

Expected: still FAIL only on visible entry point assertions that are completed in later tasks. Metadata, builder, script, install, release, and lockfile assertions should pass.

## Task 3: Rename PC Runtime Data Directory and Startup Error Copy

**Files:**
- Modify: `src/server/common/data-dir.test.ts`
- Modify: `src/server/common/data-dir.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Update the data-dir expectations first**

In `src/server/common/data-dir.test.ts`, change only the fallback expectations:

```ts
if (process.platform === 'darwin') {
  expect(dir).toBe('/Users/tester/Library/Application Support/Hobgoblin')
  return
}
if (process.platform === 'win32') {
  expect(dir).toBe('C:\\Users\\tester\\AppData\\Local\\Hobgoblin')
  return
}
expect(dir).toBe('/home/tester/.local/state/hobgoblin')
```

Keep the explicit override test using `GOBLIN_SERVER_DATA_DIR = '/tmp/goblin-explicit'` unchanged because the environment variable namespace is intentionally preserved.

- [ ] **Step 2: Run the data-dir test and verify it fails**

Run:

```bash
bun run test -- src/server/common/data-dir.test.ts
```

Expected: FAIL with an expectation showing the old `Goblin` or `goblin` fallback directory.

- [ ] **Step 3: Update the fallback data directories**

In `src/server/common/data-dir.ts`, change only fallback directory names:

```ts
if (process.platform === 'darwin') {
  const home = process.env.HOME?.trim()
  if (home) return path.join(home, 'Library', 'Application Support', 'Hobgoblin')
}
if (process.platform === 'win32') {
  const localAppData = process.env.LOCALAPPDATA?.trim()
  if (localAppData) return path.join(localAppData, 'Hobgoblin')
  const appData = process.env.APPDATA?.trim()
  if (appData) return path.join(appData, 'Hobgoblin')
  const userProfile = process.env.USERPROFILE?.trim()
  if (userProfile) return path.join(userProfile, 'AppData', 'Local', 'Hobgoblin')
}
const xdgStateHome = process.env.XDG_STATE_HOME?.trim()
if (xdgStateHome) return path.join(xdgStateHome, 'hobgoblin')
const home = process.env.HOME?.trim()
if (home) return path.join(home, '.local', 'state', 'hobgoblin')
return path.join(process.cwd(), '.hobgoblin-server')
```

- [ ] **Step 4: Update startup error dialog title**

In `src/main/main.ts`, change:

```ts
dialog.showErrorBox('Hobgoblin failed to start', `Embedded web server failed to start.\n\n${message}`)
```

- [ ] **Step 5: Re-run focused tests**

Run:

```bash
bun run test -- src/server/common/data-dir.test.ts src/main/desktop-identity.test.ts
```

Expected: PASS for data-dir and startup dialog string coverage.

## Task 4: Rename User-Visible i18n Product Copy

**Files:**
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Add dictionary regression coverage**

Append this test to `src/shared/i18n/dictionaries.test.ts` inside the existing `describe('i18n dictionaries', () => { ... })` block:

```ts
test('uses Hobgoblin in user-visible product copy', () => {
  for (const [lang, dict] of Object.entries(dicts)) {
    expect(dict['about.app'], `${lang}.about.app`).toBe('Hobgoblin')
    expect(
      dict['settings.general.open-from-terminal-command'],
      `${lang}.settings.general.open-from-terminal-command`,
    ).toBe('open -b hobgoblin.app /path/to/repo')

    for (const [key, value] of Object.entries(dict)) {
      expect(value, `${lang}.${key}`).not.toContain('Goblin')
      expect(value, `${lang}.${key}`).not.toMatch(/(^|[^a-z])goblin\.app\b/)
    }
  }
})
```

- [ ] **Step 2: Run the dictionary test and verify it fails**

Run:

```bash
bun run test -- src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL with old `Goblin` and `open -b goblin.app /path/to/repo` values.

- [ ] **Step 3: Update English dictionary values**

In `src/shared/i18n/en.ts`, replace user-visible application references:

```ts
// Brand names (Hobgoblin / GitHub / Finder) are not translated.
```

Use `Hobgoblin` wherever values currently refer to the app as `Goblin`, and set:

```ts
'settings.general.open-from-terminal-command': 'open -b hobgoblin.app /path/to/repo',
'about.app': 'Hobgoblin',
```

- [ ] **Step 4: Update Chinese dictionary values**

In `src/shared/i18n/zh.ts`, replace user-visible application references with `Hobgoblin`, including:

```ts
// 风格：按钮/菜单短句、提示句加句号；品牌名（Hobgoblin / GitHub / Finder）不翻译。
'settings.general.open-from-terminal-command': 'open -b hobgoblin.app /path/to/repo',
'about.app': 'Hobgoblin',
```

- [ ] **Step 5: Update Korean dictionary values**

In `src/shared/i18n/ko.ts`, replace user-visible application references with `Hobgoblin`, including:

```ts
// 브랜드명(Hobgoblin / GitHub / Finder)은 번역하지 않음.
'settings.general.open-from-terminal-command': 'open -b hobgoblin.app /path/to/repo',
'about.app': 'Hobgoblin',
```

- [ ] **Step 6: Update Japanese dictionary values**

In `src/shared/i18n/ja.ts`, replace user-visible application references with `Hobgoblin`, including:

```ts
// ブランド名（Hobgoblin / GitHub / Finder / Ghostty）は翻訳しない。
'settings.general.open-from-terminal-command': 'open -b hobgoblin.app /path/to/repo',
'about.app': 'Hobgoblin',
```

- [ ] **Step 7: Re-run dictionary tests**

Run:

```bash
bun run test -- src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: PASS.

## Task 5: Rename Visible Web Shell Copy

**Files:**
- Create: `src/web/components/Logo.test.tsx`
- Modify: `src/web/components/Logo.tsx`
- Modify: `src/web/index.html`
- Modify: `src/web/components/settings/pages/AboutSettings.tsx`
- Modify: `src/web/renderer-bridge.ts`
- Modify: `src/web/renderer-terminal-bridge.ts`

- [ ] **Step 1: Add focused Logo test**

Create `src/web/components/Logo.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Logo } from '#/web/components/Logo.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('Logo', () => {
  test('renders the Hobgoblin wordmark with an accessible label', () => {
    render(<Logo />)

    const logo = document.body.querySelector('[aria-label="Hobgoblin"]')
    expect(logo).toBeInstanceOf(HTMLSpanElement)
    expect(logo?.textContent).toBe('Hobgoblin')
  })
})

function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
}
```

- [ ] **Step 2: Run the Logo test and verify it fails**

Run:

```bash
bun run test -- src/web/components/Logo.test.tsx
```

Expected: FAIL because the current wordmark still renders `Goblin`.

- [ ] **Step 3: Update Logo component**

In `src/web/components/Logo.tsx`, update comment, label, and text:

```tsx
// In-app Hobgoblin wordmark. Plain typography — set in the theme
```

```tsx
aria-label="Hobgoblin"
```

```tsx
Hobgoblin
```

- [ ] **Step 4: Update renderer HTML and About alt text**

In `src/web/index.html`, change:

```html
Hobgoblin does not embed its renderer in a frame
```

```html
<title>Hobgoblin</title>
```

Keep the existing `/goblin.png` filename unless a separate asset rename is explicitly planned.

In `src/web/components/settings/pages/AboutSettings.tsx`, change:

```tsx
<img src={appIconUrl} alt="Hobgoblin" className="size-8 shrink-0 rounded-lg" />
```

- [ ] **Step 5: Update renderer user-facing fallback errors**

In `src/web/renderer-bridge.ts`, change each user-facing bridge error to:

```ts
throw new Error('Hobgoblin bridge is unavailable')
```

Do not rename `goblinNative`.

In `src/web/renderer-terminal-bridge.ts`, change the browser fallback test notification title to:

```ts
return options.sendTestNotification?.() ?? showBrowserNotification('Hobgoblin', 'Test notification')
```

- [ ] **Step 6: Re-run focused web tests**

Run:

```bash
bun run test -- src/web/components/Logo.test.tsx src/main/desktop-identity.test.ts src/web/terminal.test.ts
```

Expected: PASS.

## Task 6: Rename Current Product Docs Outside Historical Plans

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/index.html`

- [ ] **Step 1: Update docs overview heading**

In `docs/README.md`, change:

```md
# Hobgoblin Design Notes
```

- [ ] **Step 2: Update current static docs page product copy**

In `docs/index.html`, update current product references from `Goblin` to `Hobgoblin` and from `Goblin Icon` to `Hobgoblin Icon`.

Keep the existing `goblin.png` image filename unless a separate asset rename is explicitly planned.

- [ ] **Step 3: Verify no current docs still use old visible branding**

Run:

```bash
rg -n "Goblin|goblin\\.app|Goblin\\.app" "README.md" "docs/README.md" "docs/index.html"
```

Expected: no matches.

## Task 7: Classify Remaining `goblin` Occurrences and Run Full Verification

**Files:**
- No direct file edits expected unless the scans reveal an unclassified visible product identity.

- [ ] **Step 1: Run focused product identity scan**

Run:

```bash
rg -n -i "goblin" "package.json" "bun.lock" "electron-builder.ts" "install.sh" "scripts" "src/main" "src/server" "src/shared/i18n" "src/web" "README.md" "docs/README.md" "docs/index.html" --glob '!android/**' --glob '!docs/android/**' --glob '!docs/superpowers/**'
```

Expected remaining categories:

- `hobgoblin` or `Hobgoblin`.
- Internal namespaces intentionally preserved, such as `goblin:rpc`, `window.goblinNative`, `__GOBLIN_BOOTSTRAP__`, `GOBLIN_SERVER_*`, `GOBLIN_WEB_DEV_*`, `x-goblin-internal-secret`, `.goblin-terminal-*`, `application/x-goblin-file-paths+json`, and `installGoblinTestBridge`.
- Generic fixture paths such as `/tmp/goblin-repo`.
- Asset filenames such as `goblin.png`, if not renamed in this plan.

There should be no remaining user-visible app-name references to bare `Goblin`, no `goblin.app` bundle examples, and no `Goblin.app` app bundle examples in the scoped PC files.

- [ ] **Step 2: Confirm Android files are untouched**

Run:

```bash
git diff --name-only -- "android" "docs/android"
```

Expected: no output.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 6: Optionally verify Electron app bundle name when dependencies are available**

Run:

```bash
bun run build:electron -- --mac dir --arm64
```

Expected on arm64 macOS: a generated `release/mac-arm64/Hobgoblin.app`.

Run this only after `bun run build:web` and `bun run build:server` have produced required artifacts, or use `bun scripts/build.ts install --clean` if an install verification is intentionally requested. The install path can close and replace a running `Hobgoblin.app`, so do not run install mode without explicit user approval.

- [ ] **Step 7: Check worktree status without committing**

Run:

```bash
git status --short
```

Expected: changed implementation files and the new spec/plan files. Do not run `git commit` unless the user explicitly asks for it.

## Self-Review Notes

- Spec coverage: desktop identity, runtime data isolation, user-facing copy, internal namespace preservation, tests, scans, and Android exclusion are each covered by a task.
- Placeholder scan: this plan intentionally contains no placeholder sections.
- Type consistency: all new test names and file paths match the files listed above.
- Git safety: commit steps are omitted because repository instructions say not to plan or execute git commits unless explicitly requested.
