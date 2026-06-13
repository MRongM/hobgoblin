# Hobgoblin Logo And Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Hobgoblin's current brand assets with the approved full-bleed B1 dark terminal icon and W1 clean system wordmark.

**Architecture:** Keep one maintainable source SVG at `assets/hobgoblin-icon.svg`, then generate all published PNG assets from it while preserving existing file paths. Keep the wordmark as a focused React component that renders only the `Hobgoblin` text mark with system typography.

**Tech Stack:** SVG, PNG assets, React 19, Vitest, Bun, macOS `qlmanage` for SVG rasterization.

**Execution note:** Do not add commit steps. The user explicitly requested no commit for this workflow.

---

## File Structure

- `assets/hobgoblin-icon.svg`: source-of-truth full-bleed B1 dark terminal icon.
- `assets/icon.png`: generated 1024x1024 PNG used by in-app/About contexts.
- `assets/icon-mac-1024.png`: generated 1024x1024 PNG used by Electron packaging.
- `docs/goblin.png`: generated 1024x1024 PNG used by the static docs site.
- `src/web/public/goblin.png`: generated 1024x1024 PNG used by the renderer favicon path.
- `src/web/brand-assets.test.ts`: asset contract tests for SVG semantics and PNG dimensions.
- `src/web/components/Logo.tsx`: W1 clean system wordmark.
- `src/web/components/Logo.test.tsx`: focused wordmark rendering test.

### Task 1: Lock The Brand Asset Contract

**Files:**
- Create or modify: `src/web/brand-assets.test.ts`

- [ ] **Step 1: Write the asset contract test**

Replace `src/web/brand-assets.test.ts` with:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const pngAssets = [
  'assets/icon.png',
  'assets/icon-mac-1024.png',
  'docs/goblin.png',
  'src/web/public/goblin.png',
]

describe('brand assets', () => {
  test('keeps a source SVG for the full-bleed Hobgoblin terminal branch icon', () => {
    const svg = readFileSync('assets/hobgoblin-icon.svg', 'utf8')

    expect(svg).toContain('aria-labelledby="title"')
    expect(svg).toContain('>Hobgoblin full-bleed dark terminal branch icon</title>')
    expect(svg).toContain('data-direction="b1-dark-terminal"')
    expect(svg).toContain('data-edge="terminal-full-bleed"')
    expect(svg).toContain('id="terminal-window"')
    expect(svg).toContain('id="prompt-glyph"')
    expect(svg).toContain('id="terminal-baseline"')
    expect(svg).toContain('id="branch-path"')
    expect(svg).not.toContain('id="tile-gradient"')
    expect(svg).not.toContain('fill="url(#tile-gradient)"')
  })

  test('keeps published PNG icon assets at 1024px square', () => {
    for (const assetPath of pngAssets) {
      expect(readPngDimensions(assetPath)).toEqual({ width: 1024, height: 1024 })
    }
  })
})

function readPngDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path)
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}
```

- [ ] **Step 2: Run the focused asset test and verify it fails for the old icon source**

Run:

```bash
bun run test src/web/brand-assets.test.ts
```

Expected before Task 2: FAIL because the current source SVG does not contain `data-edge="terminal-full-bleed"` and still has the old light tile.

### Task 2: Create The Full-Bleed B1 Dark Terminal Source SVG

**Files:**
- Modify: `assets/hobgoblin-icon.svg`
- Test: `src/web/brand-assets.test.ts`

- [ ] **Step 1: Replace the SVG with the B1 source**

Replace `assets/hobgoblin-icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title" data-direction="b1-dark-terminal" data-edge="terminal-full-bleed">
  <title id="title">Hobgoblin full-bleed dark terminal branch icon</title>
  <defs>
    <linearGradient id="terminal-gradient" x1="96" y1="96" x2="928" y2="928" gradientUnits="userSpaceOnUse">
      <stop stop-color="#111827" />
      <stop offset="1" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="branch-gradient" x1="630" y1="322" x2="854" y2="714" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38bdf8" />
      <stop offset="1" stop-color="#22c55e" />
    </linearGradient>
  </defs>

  <rect x="64" y="88" width="896" height="872" rx="224" fill="#020617" opacity="0.24" />

  <g id="terminal-window">
    <rect x="64" y="64" width="896" height="896" rx="224" fill="url(#terminal-gradient)" />
    <circle cx="180" cy="188" r="24" fill="#ef4444" />
    <circle cx="260" cy="188" r="24" fill="#f59e0b" />
    <circle cx="340" cy="188" r="24" fill="#22c55e" />
  </g>

  <g id="prompt-glyph">
    <path d="M230 402l152 152-152 152" fill="none" stroke="#f8fafc" stroke-width="88" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <path id="terminal-baseline" d="M486 682h224" fill="none" stroke="#cbd5e1" stroke-width="70" stroke-linecap="round" />

  <g id="branch-path">
    <path d="M630 322v186c0 124 86 206 224 206" fill="none" stroke="url(#branch-gradient)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="630" cy="322" r="70" fill="#38bdf8" />
    <circle cx="630" cy="322" r="32" fill="#dbeafe" />
    <circle cx="854" cy="714" r="70" fill="#22c55e" />
    <circle cx="854" cy="714" r="32" fill="#dcfce7" />
  </g>
</svg>
```

- [ ] **Step 2: Run the focused asset test and verify the SVG contract passes**

Run:

```bash
bun run test src/web/brand-assets.test.ts
```

Expected after replacing the SVG: PASS if the existing PNG assets are still 1024x1024. If the PNG dimension assertion fails, continue to Task 3 and regenerate the PNGs before rerunning.

### Task 3: Generate The Published PNG Assets

**Files:**
- Modify: `assets/icon.png`
- Modify: `assets/icon-mac-1024.png`
- Modify: `docs/goblin.png`
- Modify: `src/web/public/goblin.png`
- Test: `src/web/brand-assets.test.ts`

- [ ] **Step 1: Render the SVG to a temporary PNG**

Run:

```bash
mkdir -p /tmp/hobgoblin-icon-render-full-bleed
qlmanage -t -s 1024 -o /tmp/hobgoblin-icon-render-full-bleed assets/hobgoblin-icon.svg
test -f /tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png
```

Expected: `qlmanage` writes `/tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png`, and the `test -f` command exits 0.

If sandboxing blocks `qlmanage` with an operation permission error, rerun the same command with elevated sandbox permissions. Do not install a new package for rasterization.

- [ ] **Step 2: Copy the rendered PNG to the existing asset paths**

Run:

```bash
cp /tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png assets/icon.png
cp /tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png assets/icon-mac-1024.png
cp /tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png docs/goblin.png
cp /tmp/hobgoblin-icon-render-full-bleed/hobgoblin-icon.svg.png src/web/public/goblin.png
```

Expected: all four files are replaced with the same 1024px generated PNG.

- [ ] **Step 3: Verify PNG dimensions**

Run:

```bash
file assets/icon.png assets/icon-mac-1024.png docs/goblin.png src/web/public/goblin.png
```

Expected output includes `PNG image data, 1024 x 1024` for all four files.

- [ ] **Step 4: Run the asset contract test**

Run:

```bash
bun run test src/web/brand-assets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect the generated icon visually**

Open or view:

```bash
open assets/icon.png
```

Expected visual result: the dark terminal surface is the icon's outer shape with no light tile or white border outside it. The icon still contains a prominent white `>` prompt, a short gray terminal baseline, and a small blue-green Git branch curve with two nodes. At small sizes, the `>` prompt remains the dominant shape.

### Task 4: Update The W1 Clean System Wordmark

**Files:**
- Modify: `src/web/components/Logo.tsx`
- Modify: `src/web/components/Logo.test.tsx`

- [ ] **Step 1: Update the Logo test for the clean wordmark contract**

Replace the test body in `src/web/components/Logo.test.tsx` with:

```tsx
describe('Logo', () => {
  test('renders the clean Hobgoblin wordmark with an accessible label', () => {
    render(<Logo />)

    const logo = document.body.querySelector('[aria-label="Hobgoblin"]')
    expect(logo).toBeInstanceOf(HTMLSpanElement)
    expect(logo?.textContent).toBe('Hobgoblin')
    expect(logo?.querySelector('svg')).toBeNull()
    expect(logo?.getAttribute('style')).toContain('font-weight: 600')
    expect(logo?.getAttribute('style')).toContain('letter-spacing: 0px')
  })
})
```

Keep the imports, setup, teardown, and `render()` helper unchanged.

- [ ] **Step 2: Run the focused Logo test and verify it fails before implementation**

Run:

```bash
bun run test src/web/components/Logo.test.tsx
```

Expected before implementation: FAIL because `Logo.tsx` still uses `fontWeight: 500` and size-derived letter spacing.

- [ ] **Step 3: Update `Logo.tsx` to W1 styling**

Change the comment and style block in `src/web/components/Logo.tsx` to:

```tsx
// In-app Hobgoblin wordmark. Clean system typography set in the theme
// foreground colour, sitting in the macOS title bar like a native window title.
//
// The app icon carries the Git + terminal identity; this wordmark stays
// restrained and text-only.
```

Use this style object:

```tsx
style={{
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,
  fontSize: `${size}px`,
  letterSpacing: '0px',
  lineHeight: 1,
}}
```

Do not add an icon, prompt prefix, path prefix, or nested SVG to the wordmark.

- [ ] **Step 4: Run the focused Logo test**

Run:

```bash
bun run test src/web/components/Logo.test.tsx
```

Expected: PASS.

### Task 5: Run Full Verification

**Files:**
- Check: `assets/hobgoblin-icon.svg`
- Check: `assets/icon.png`
- Check: `assets/icon-mac-1024.png`
- Check: `docs/goblin.png`
- Check: `src/web/public/goblin.png`
- Check: `src/web/brand-assets.test.ts`
- Check: `src/web/components/Logo.tsx`
- Check: `src/web/components/Logo.test.tsx`

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: exit code 0 and `[typecheck] all projects passed`.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: exit code 0 with all Vitest test files passing.

- [ ] **Step 3: Run architecture check**

Run:

```bash
bun run check:architecture
```

Expected: exit code 0 and `[architecture] import boundaries passed`.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --stat
git diff -- assets/hobgoblin-icon.svg src/web/brand-assets.test.ts src/web/components/Logo.tsx src/web/components/Logo.test.tsx
```

Expected: the diff is limited to the source icon, generated PNG assets, focused asset tests, the Logo component, the Logo test, and the approved spec/plan files already in progress. There should be no package identity, bundle id, IPC, data directory, or docs landing layout changes.

## Self-Review

- Spec coverage: tasks cover the B1 source icon, generated PNG asset synchronization, W1 wordmark, asset tests, focused component tests, and full verification commands.
- Red-flag scan: this plan contains no unfinished implementation markers.
- Type consistency: all referenced paths and test names match the current TypeScript/Vitest project layout.
