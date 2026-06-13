# Terminal Sequence Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefix every terminal display title with its existing terminal sequence number, so tabs visibly show `#1`, `#2`, and later session numbers.

**Architecture:** Add the prefix at the `TerminalSessionRegistry` summary boundary where `TerminalSessionSummary.title` and `TerminalSessionSummary.fullTitle` are created. Keep `originalTitle` undecorated and avoid server/shared schema changes. Existing `TerminalTabs` surfaces will inherit the prefix through summary fields.

**Tech Stack:** TypeScript, React terminal UI model, Vitest with jsdom, Bun scripts.

**Git safety:** Commit steps are intentionally omitted because this repository's `AGENTS.md` requires explicit user confirmation before `git commit`.

---

## File Structure

- `src/web/components/terminal/TerminalSessionRegistry.test.ts`: Add focused tests for prefixed `title` / `fullTitle` and undecorated `originalTitle`.
- `src/web/components/terminal/TerminalSessionRegistry.ts`: Add small title prefix helpers and apply them only to `TerminalSessionSummary.title` and `TerminalSessionSummary.fullTitle`.

No `TerminalTabs` change is needed. Tabs, collapsed dropdowns, close confirmation, and ARIA labels already consume `TerminalSessionSummary` fields.

## Task 1: Add Sequence Prefix at Terminal Summary Boundary

**Files:**

- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`

- [ ] **Step 1: Add failing registry summary tests**

In `src/web/components/terminal/TerminalSessionRegistry.test.ts`, add this `describe` block after the existing `describe('reconcileServerSessions', () => { ... })` block and before `describe('snapshot cache', () => { ... })`:

```ts
describe('terminal display titles', () => {
  test('prefixes compact and full canonical titles with the terminal sequence number', () => {
    registry.setRepoIndex(makeRepoIndex())

    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-2', 'terminal-2', {
          canonicalTitle: '~/repo/app — npm run dev',
          processName: 'node',
        }),
      ],
      'attachment_local',
      new Map(),
    )

    const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
    expect(summary).toMatchObject({
      terminalId: 'terminal-2',
      index: 2,
      title: '#2 app · npm run dev',
      fullTitle: '#2 ~/repo/app — npm run dev',
      originalTitle: '~/repo/app — npm run dev',
    })
  })

  test('prefixes process fallback titles with the terminal sequence number', () => {
    registry.setRepoIndex(makeRepoIndex())

    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-1', 'terminal-1', {
          canonicalTitle: null,
          processName: '/bin/zsh',
        }),
      ],
      'attachment_local',
      new Map(),
    )

    const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
    expect(summary).toMatchObject({
      terminalId: 'terminal-1',
      index: 1,
      title: '#1 zsh',
      fullTitle: '#1 /bin/zsh',
      originalTitle: null,
    })
  })

  test('prefixes empty title fallback with the terminal sequence number', () => {
    registry.setRepoIndex(makeRepoIndex())

    registry.reconcileServerSessions(
      REPO_ROOT,
      [
        makeServerSession('session-3', 'terminal-3', {
          canonicalTitle: null,
          processName: '',
        }),
      ],
      'attachment_local',
      new Map(),
    )

    const summary = registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]
    expect(summary).toMatchObject({
      terminalId: 'terminal-3',
      index: 3,
      title: '#3 terminal 3',
      fullTitle: '#3 terminal 3',
      originalTitle: null,
    })
  })
})
```

- [ ] **Step 2: Run the focused registry test and verify it fails**

Run:

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: FAIL because summaries currently return unprefixed values such as `app · npm run dev`, `/bin/zsh`, and `terminal 3`.

- [ ] **Step 3: Apply the prefix in `sessionSummaries()`**

In `src/web/components/terminal/TerminalSessionRegistry.ts`, replace the object construction inside `sessionSummaries()` with this shape:

```ts
const index = session.descriptor.index
return {
  key: session.descriptor.key,
  worktreeTerminalKey,
  terminalId: session.descriptor.terminalId,
  index,
  title: withTerminalSequencePrefix(index, summarizeTerminalTitle(snapshot, index)),
  fullTitle: withTerminalSequencePrefix(index, fullTerminalTitle(snapshot, index)),
  originalTitle: terminalOriginalTitle(snapshot),
  phase: snapshot.phase,
  selected: session.descriptor.key === selectedKey,
  hasBell: this.bellController.hasBell(session.descriptor.key),
}
```

- [ ] **Step 4: Add title prefix helpers**

In `src/web/components/terminal/TerminalSessionRegistry.ts`, add these helpers above `summarizeTerminalTitle()`:

```ts
function formatTerminalSequencePrefix(index: number): string {
  return `#${index}`
}

function withTerminalSequencePrefix(index: number, title: string): string {
  const trimmedTitle = title.trim()
  return `${formatTerminalSequencePrefix(index)} ${trimmedTitle || `terminal ${index}`}`
}
```

- [ ] **Step 5: Run the focused registry test and verify it passes**

Run:

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: PASS.

## Task 2: Verify UI Consumers and Type Safety

**Files:**

- Validate terminal registry and tab consumers.

- [ ] **Step 1: Run terminal registry and tab tests together**

Run:

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalTabs.test.tsx
```

Expected: PASS. `TerminalTabs` should not need code changes because its tests pass direct `TerminalSessionSummary` fixtures and the production component already renders summary fields.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run touched-file format check**

Run:

```bash
./node_modules/.bin/prettier --check "src/web/components/terminal/TerminalSessionRegistry.test.ts" "src/web/components/terminal/TerminalSessionRegistry.ts" "docs/superpowers/specs/2026-06-13-terminal-sequence-prefix-design.md" "docs/superpowers/plans/2026-06-13-terminal-sequence-prefix.md"
```

Expected: PASS. If it fails, run the same command with `--write`, then repeat Steps 1-3.

- [ ] **Step 4: Optional visual smoke check**

Run the app and open a worktree with multiple terminal sessions.

Expected visible tab labels:

```text
#1 <current shell/title>
#2 <current shell/title>
```

The tooltip can still show the undecorated original terminal-provided title through `originalTitle`.
