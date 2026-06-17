# Port Panel Compact UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository `Ports` tab narrower and denser while preserving the current port-forwarding behavior.

**Architecture:** Keep the change local to the renderer ports panel plus the existing i18n dictionaries. Tests lock the behavior and accessibility labels first, then the UI implementation narrows only presentation classes and visible copy.

**Tech Stack:** React 19, TypeScript strip-only mode, Tailwind CSS utility classes, Vitest/jsdom, existing shadcn-style UI primitives.

---

## File Structure

- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`
  - Adds assertions that the compact visible labels still preserve full accessible labels and that the icon-only start button remains discoverable.
- Modify: `src/shared/i18n/en.ts`
  - Adds `ports.lan-short`.
- Modify: `src/shared/i18n/zh.ts`
  - Adds `ports.lan-short`.
- Modify: `src/shared/i18n/ja.ts`
  - Adds `ports.lan-short`.
- Modify: `src/shared/i18n/ko.ts`
  - Adds `ports.lan-short`.
- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
  - Applies local compact classes to the form, input fields, LAN label, start button, and session rows.

Do not add shared `Input`, `Switch`, or `Button` variants. This keeps the density change scoped to the only panel that needs it.

## Task 1: Lock Compact Ports Panel Behavior

**Files:**

- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Add assertions for compact visible labels and preserved accessible labels**

In the `renders remote form and loads sessions` test, replace the switch assertion:

```ts
expect(container.querySelector('[role="switch"]')).toBeTruthy()
```

with:

```ts
const lanSwitch = container.querySelector<HTMLElement>('[role="switch"]')
expect(lanSwitch).toBeTruthy()
expect(lanSwitch?.getAttribute('aria-label')).toBe('ports.allow-lan-access')
expect(lanSwitch?.getAttribute('title')).toBe('ports.allow-lan-access')
expect(container.textContent).toContain('ports.lan-short')
```

In the `starts a port forward from form values` test, add this assertion before the click:

```ts
const startButton = container.querySelector<HTMLButtonElement>('[data-testid="ports-start"]')
expect(startButton?.getAttribute('aria-label')).toBe('ports.start')
expect(startButton?.getAttribute('title')).toBe('ports.start')
expect(startButton?.textContent).not.toContain('ports.start')
```

Then replace the click block with:

```ts
await act(async () => {
  startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
```

- [ ] **Step 2: Run the focused test and verify it fails before implementation**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected result:

```text
FAIL src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

The failure should show that `title` is missing, `ports.lan-short` is not rendered, or the start button still contains `ports.start` as visible text.

## Task 2: Add Short LAN Translation Key

**Files:**

- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add `ports.lan-short` to every i18n dictionary**

Add the key immediately after `ports.allow-lan-access` in each file:

```ts
'ports.allow-lan-access': 'Allow LAN connections',
'ports.lan-short': 'LAN',
'ports.start': 'Forward',
```

```ts
'ports.allow-lan-access': '允许局域网连接',
'ports.lan-short': 'LAN',
'ports.start': '转发',
```

```ts
'ports.allow-lan-access': 'LAN 接続を許可',
'ports.lan-short': 'LAN',
'ports.start': '転送',
```

```ts
'ports.allow-lan-access': 'LAN 연결 허용',
'ports.lan-short': 'LAN',
'ports.start': '전달',
```

- [ ] **Step 2: Run the focused test and confirm only UI implementation failures remain**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected result:

```text
FAIL src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

The translation lookup should no longer be the reason for failure. Remaining failures should come from `ProjectPortsPanel.tsx` not yet rendering compact labels and icon-only start.

## Task 3: Implement Compact Ports Panel UI

**Files:**

- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`

- [ ] **Step 1: Introduce label constants inside the remote panel render path**

After `if (!view.isRemote) { ... }` and before `return (`, add:

```ts
const lanAccessLabel = t('ports.allow-lan-access')
const startLabel = t('ports.start')
```

This avoids repeated translation calls and keeps full accessible labels separate from short visible copy.

- [ ] **Step 2: Narrow the form grid and inputs**

Replace the form wrapper class:

```tsx
<div className="grid items-center gap-2 md:grid-cols-[7rem_7rem_minmax(12rem,1fr)_auto]">
```

with:

```tsx
<div className="grid items-center gap-1.5 md:grid-cols-[5.5rem_5.5rem_auto_auto]">
```

Add the same compact class to both port inputs:

```tsx
className="h-7 px-2 py-1 text-xs"
```

The local port input should become:

```tsx
<Input
  name="localPort"
  value={localPort}
  onChange={(event) => handleLocalPortChange(event.currentTarget.value)}
  placeholder={t('ports.local-port')}
  aria-label={t('ports.local-port')}
  className="h-7 px-2 py-1 text-xs"
/>
```

The remote port input should become:

```tsx
<Input
  name="remotePort"
  value={remotePort}
  onChange={(event) => handleRemotePortChange(event.currentTarget.value)}
  placeholder={t('ports.remote-port')}
  aria-label={t('ports.remote-port')}
  className="h-7 px-2 py-1 text-xs"
/>
```

- [ ] **Step 3: Shorten the LAN visible label while preserving the full label**

Replace the current LAN label block:

```tsx
<label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
  <Switch
    checked={allowLanAccess}
    onCheckedChange={setAllowLanAccess}
    aria-label={t('ports.allow-lan-access')}
  />
  <span className="truncate">{t('ports.allow-lan-access')}</span>
</label>
```

with:

```tsx
<label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={lanAccessLabel}>
  <Switch
    checked={allowLanAccess}
    onCheckedChange={setAllowLanAccess}
    aria-label={lanAccessLabel}
    title={lanAccessLabel}
  />
  <span className="text-[11px] leading-none">{t('ports.lan-short')}</span>
</label>
```

- [ ] **Step 4: Change the start button to icon-only**

Replace the current start button:

```tsx
<Button data-testid="ports-start" type="button" disabled={pending} onClick={handleStart}>
  <Play className="size-3.5" />
  {t('ports.start')}
</Button>
```

with:

```tsx
<Button
  data-testid="ports-start"
  type="button"
  size="icon-sm"
  disabled={pending}
  aria-label={startLabel}
  title={startLabel}
  onClick={handleStart}
>
  <Play className="size-3.5" />
</Button>
```

- [ ] **Step 5: Tighten session row spacing**

Replace the session row wrapper class:

```tsx
<div className="flex min-w-0 items-center gap-2 rounded border border-separator px-2 py-1.5">
```

with:

```tsx
<div className="flex min-w-0 items-center gap-1.5 rounded border border-separator px-1.5 py-1">
```

Change each session action button size from:

```tsx
size="icon-sm"
```

to:

```tsx
size="icon-xs"
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected result:

```text
PASS src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

## Task 4: Full Verification

**Files:**

- Read only after implementation unless failures point to specific files.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result:

```text
No type errors.
```

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected result:

```text
All tests pass.
```

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff -- src/web/components/repo-workspace/ProjectPortsPanel.tsx src/web/components/repo-workspace/ProjectPortsPanel.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected result:

```text
The diff only contains compact ports panel UI, the short LAN translation key, and focused test updates.
```

No git commit step is included because project instructions say not to plan or execute git commits unless the user explicitly asks for them.
