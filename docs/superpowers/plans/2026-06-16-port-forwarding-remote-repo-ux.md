# Remote Repository Port Forwarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify remote repository port forwarding so users enter ports, toggle LAN access, and no longer type local or remote host values.

**Architecture:** Keep the existing port-forwarding feature slice. The renderer owns the simplified form state and derives `localBindHost` / `remoteHost` at submit time; shared, server, and system layers keep their current generic request model and SSH lifecycle responsibilities.

**Tech Stack:** React, TypeScript strip-only mode, Vitest, jsdom, Hono routes, OpenSSH child process wrapper, Bun.

---

## Planning Notes

This plan intentionally does not include `git commit` steps. `AGENTS.md` for this repository says not to plan or execute git commits unless the user explicitly asks for them.

Design spec: `docs/superpowers/specs/2026-06-16-port-forwarding-remote-repo-ux-design.md`

## File Structure

- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`
  - Owns jsdom coverage for the `Ports` panel form behavior and submitted request.
- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
  - Owns the simplified remote port-forwarding form, local-only state, session list, and start/stop actions.
- Modify: `src/shared/i18n/en.ts`
  - Adds English copy for the LAN access toggle.
- Modify: `src/shared/i18n/zh.ts`
  - Adds Chinese copy for the LAN access toggle.
- Modify: `src/shared/i18n/ko.ts`
  - Adds Korean copy for the LAN access toggle.
- Modify: `src/shared/i18n/ja.ts`
  - Adds Japanese copy for the LAN access toggle.

No server, route, shared model, or SSH process file should change unless a test exposes a real compatibility bug. The lower layers already accept explicit hosts and build the required `ssh -L` arguments.

### Task 1: Add Renderer Behavior Tests

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`
- Test: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Replace the remote form rendering expectation**

In `renders remote form and loads sessions`, replace the input assertions with this exact expectation block:

```tsx
expect(container.querySelector('input[name="localPort"]')).toBeTruthy()
expect(container.querySelector('input[name="remotePort"]')).toBeTruthy()
expect(container.querySelector('input[name="localBindHost"]')).toBeNull()
expect(container.querySelector('input[name="remoteHost"]')).toBeNull()
expect(container.querySelector('[role="switch"]')).toBeTruthy()
expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo', expect.any(AbortSignal))
```

- [ ] **Step 2: Replace the non-loopback warning test with LAN toggle behavior**

Replace `shows warning for non-loopback bind host` with:

```tsx
test('shows warning when LAN access is enabled', async () => {
  seedRepo('ssh-config://prod/srv/repo')
  const { container, root } = await render('ssh-config://prod/srv/repo')
  expect(container.textContent).not.toContain('ports.non-loopback-warning')
  await toggleLanAccess(container)
  expect(container.textContent).toContain('ports.non-loopback-warning')
  await act(async () => root.unmount())
})
```

- [ ] **Step 3: Add local-to-remote port following coverage**

Add this test after the LAN warning test:

```tsx
test('defaults remote port from local port until remote port is edited', async () => {
  seedRepo('ssh-config://prod/srv/repo')
  const { container, root } = await render('ssh-config://prod/srv/repo')

  await fill(container, 'localPort', '3000')
  expect(inputValue(container, 'remotePort')).toBe('3000')

  await fill(container, 'remotePort', '5173')
  await fill(container, 'localPort', '4000')
  expect(inputValue(container, 'remotePort')).toBe('5173')

  await act(async () => root.unmount())
})
```

- [ ] **Step 4: Update the submit request test**

In `starts a port forward from form values`, remove the remote host fill and assert the fixed hosts. The test body should be:

```tsx
test('starts a port forward from form values', async () => {
  seedRepo('ssh-config://prod/srv/repo')
  const { container, root } = await render('ssh-config://prod/srv/repo')
  await fill(container, 'localPort', '3000')
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="ports-start"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await vi.waitFor(() => {
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '127.0.0.1',
        localPort: 3000,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      },
      expect.any(AbortSignal),
    )
  })
  await act(async () => root.unmount())
})
```

- [ ] **Step 5: Add LAN submit request coverage**

Add this test after `starts a port forward from form values`:

```tsx
test('starts a port forward bound to all interfaces when LAN access is enabled', async () => {
  seedRepo('ssh-config://prod/srv/repo')
  const { container, root } = await render('ssh-config://prod/srv/repo')
  await fill(container, 'localPort', '3000')
  await fill(container, 'remotePort', '5173')
  await toggleLanAccess(container)
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="ports-start"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await vi.waitFor(() => {
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '0.0.0.0',
        localPort: 3000,
        remoteHost: '127.0.0.1',
        remotePort: 5173,
      },
      expect.any(AbortSignal),
    )
  })
  await act(async () => root.unmount())
})
```

- [ ] **Step 6: Add test helpers**

Add these helpers near the existing `fill` / `setInputValue` helpers:

```tsx
function inputValue(container: HTMLElement, name: string): string {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!input) throw new Error(`missing ${name} input`)
  return input.value
}

async function toggleLanAccess(container: HTMLElement): Promise<void> {
  const toggle = container.querySelector<HTMLElement>('[role="switch"]')
  if (!toggle) throw new Error('missing LAN access switch')
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
```

- [ ] **Step 7: Run the focused renderer test and verify it fails**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: FAIL. The failure should show that `localBindHost` / `remoteHost` inputs still exist or that submitted host/port values do not match the new expectation.

### Task 2: Implement Simplified Ports Form

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
- Test: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Add the Switch import**

Add this import with the other UI primitive imports:

```tsx
import { Switch } from '#/web/components/ui/switch.tsx'
```

- [ ] **Step 2: Add host constants**

Add these constants below the `PortsPanelView` interface:

```tsx
const LOOPBACK_BIND_HOST = '127.0.0.1'
const LAN_BIND_HOST = '0.0.0.0'
const REMOTE_LOOPBACK_HOST = '127.0.0.1'
```

- [ ] **Step 3: Replace host state with LAN and port-follow state**

Replace the four form state declarations:

```tsx
const [localBindHost, setLocalBindHost] = useState('127.0.0.1')
const [localPort, setLocalPort] = useState('')
const [remoteHost, setRemoteHost] = useState('127.0.0.1')
const [remotePort, setRemotePort] = useState('')
```

with:

```tsx
const [allowLanAccess, setAllowLanAccess] = useState(false)
const [localPort, setLocalPort] = useState('')
const [remotePort, setRemotePort] = useState('')
const [remotePortFollowsLocal, setRemotePortFollowsLocal] = useState(true)
```

- [ ] **Step 4: Derive the local bind host**

Replace the current `nonLoopback` memo:

```tsx
const nonLoopback = useMemo(() => localBindHost.trim().length > 0 && !isLoopbackBindHost(localBindHost), [localBindHost])
```

with:

```tsx
const localBindHost = allowLanAccess ? LAN_BIND_HOST : LOOPBACK_BIND_HOST
const nonLoopback = useMemo(() => !isLoopbackBindHost(localBindHost), [localBindHost])
```

- [ ] **Step 5: Add controlled port handlers**

Add these functions immediately before `handleStart`:

```tsx
function handleLocalPortChange(value: string) {
  setLocalPort(value)
  if (remotePortFollowsLocal) setRemotePort(value)
}

function handleRemotePortChange(value: string) {
  setRemotePort(value)
  setRemotePortFollowsLocal(false)
}
```

- [ ] **Step 6: Update request normalization in `handleStart`**

Replace the object passed into `normalizePortForwardStartRequest` with:

```tsx
{
  repoId,
  localBindHost,
  localPort: Number(localPort),
  remoteHost: REMOTE_LOOPBACK_HOST,
  remotePort: Number(remotePort),
}
```

The complete normalized block should be:

```tsx
const normalized = normalizePortForwardStartRequest({
  repoId,
  localBindHost,
  localPort: Number(localPort),
  remoteHost: REMOTE_LOOPBACK_HOST,
  remotePort: Number(remotePort),
})
```

- [ ] **Step 7: Replace the form grid**

Replace the current form grid:

```tsx
<div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_7rem_auto]">
  <Input
    name="localBindHost"
    value={localBindHost}
    onChange={(event) => setLocalBindHost(event.currentTarget.value)}
    aria-label={t('ports.local-bind-host')}
  />
  <Input
    name="localPort"
    value={localPort}
    onChange={(event) => setLocalPort(event.currentTarget.value)}
    placeholder={t('ports.local-port-placeholder')}
    aria-label={t('ports.local-port')}
  />
  <Input
    name="remoteHost"
    value={remoteHost}
    onChange={(event) => setRemoteHost(event.currentTarget.value)}
    aria-label={t('ports.remote-host')}
  />
  <Input
    name="remotePort"
    value={remotePort}
    onChange={(event) => setRemotePort(event.currentTarget.value)}
    aria-label={t('ports.remote-port')}
  />
  <Button data-testid="ports-start" type="button" disabled={pending} onClick={handleStart}>
    <Play className="size-3.5" />
    {t('ports.start')}
  </Button>
</div>
```

with:

```tsx
<div className="grid items-center gap-2 md:grid-cols-[7rem_7rem_minmax(12rem,1fr)_auto]">
  <Input
    name="localPort"
    value={localPort}
    onChange={(event) => handleLocalPortChange(event.currentTarget.value)}
    placeholder={t('ports.local-port')}
    aria-label={t('ports.local-port')}
  />
  <Input
    name="remotePort"
    value={remotePort}
    onChange={(event) => handleRemotePortChange(event.currentTarget.value)}
    placeholder={t('ports.remote-port')}
    aria-label={t('ports.remote-port')}
  />
  <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
    <Switch
      checked={allowLanAccess}
      onCheckedChange={setAllowLanAccess}
      aria-label={t('ports.allow-lan-access')}
    />
    <span className="truncate">{t('ports.allow-lan-access')}</span>
  </label>
  <Button data-testid="ports-start" type="button" disabled={pending} onClick={handleStart}>
    <Play className="size-3.5" />
    {t('ports.start')}
  </Button>
</div>
```

- [ ] **Step 8: Run the focused renderer test**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: PASS. The renderer translator accepts string keys at runtime, so missing dictionary entries are verified in Task 3 by the i18n dictionary test and final typecheck.

### Task 3: Add LAN Toggle Copy

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`
- Test: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Add English copy**

In `src/shared/i18n/en.ts`, add this key next to the other `ports.*` entries:

```ts
'ports.allow-lan-access': 'Allow LAN connections',
```

- [ ] **Step 2: Add Chinese copy**

In `src/shared/i18n/zh.ts`, add this key next to the other `ports.*` entries:

```ts
'ports.allow-lan-access': '允许局域网连接',
```

- [ ] **Step 3: Add Korean copy**

In `src/shared/i18n/ko.ts`, add this key next to the other `ports.*` entries:

```ts
'ports.allow-lan-access': 'LAN 연결 허용',
```

- [ ] **Step 4: Add Japanese copy**

In `src/shared/i18n/ja.ts`, add this key next to the other `ports.*` entries:

```ts
'ports.allow-lan-access': 'LAN 接続を許可',
```

- [ ] **Step 5: Run i18n and renderer tests**

Run:

```bash
bun run test -- src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: PASS.

### Task 4: Regression Verification

**Files:**
- Test: `src/shared/port-forwarding.test.ts`
- Test: `src/server/modules/port-forwarding.test.ts`
- Test: `src/system/ssh/port-forward.test.ts`
- Test: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Run port-forwarding model and runtime tests**

Run:

```bash
bun run test -- src/shared/port-forwarding.test.ts src/server/modules/port-forwarding.test.ts src/system/ssh/port-forward.test.ts src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: PASS. This confirms the lower layers still accept generic host values and the renderer now submits the simplified defaults.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. This confirms the renderer still does not import server or main modules and the feature remains within the existing layer boundaries.

## Self-Review

- Spec coverage: The plan removes editable host inputs, adds the LAN toggle, fixes remote host to `127.0.0.1`, makes local port required in UI submit behavior, synchronizes remote port from local port until edited, and preserves the lower-level request model.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: The plan uses existing `PortForwardStartRequest` fields: `repoId`, `localBindHost`, `localPort`, `remoteHost`, and `remotePort`. New renderer-only state is `allowLanAccess` and `remotePortFollowsLocal`.
