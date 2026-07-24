# Terminal creation loading indicator design

Date: 2026-07-24

> Follow-up: `2026-07-24-terminal-creation-interactive-readiness-design.md`
> supersedes the request-settlement endpoint below. Loading now remains visible
> until the selected renderer terminal has completed attach, replay, and its
> first paint opportunity.

## Goal

Show the existing bottom-right terminal loading status for the entire time a
new internal terminal creation request is pending, then remove it when the
request succeeds or fails.

## Root cause

`TerminalSlot` currently renders the status only when a registered selected
session has `phase === 'opening'`. `TerminalSessionRegistry.createTerminal`
does not register or publish any local state before awaiting
`terminalBridge.create`. The server response contains the first frame and is
normally already `open`, so the real creation wait has no observable loading
state. The existing component test injects an already-registered `opening`
session and therefore does not cover this gap.

## Decision

1. Track pending creation counts per worktree inside `TerminalSessionRegistry`.
2. Publish a derived `creating` flag through `WorktreeTerminalSnapshot`.
3. Start the count immediately before the bridge request and decrement it in
   `finally`, preserving correct behavior if requests overlap or fail.
4. Let `TerminalSlot` show its existing accessible bottom-right loading status
   when either a creation is pending or the selected registered session is
   opening.
5. Keep `TerminalSlot` mounted during first-terminal creation in plain and
   branch-workspace terminal panels so those surfaces can render the status
   before a selected session exists.

The state is renderer-local and ephemeral. It is neither server-owned nor
restorable, and it does not create an optimistic terminal identity.

## Verification

- Registry tests cover pending state before the bridge resolves and cleanup on
  success and failure.
- `TerminalSlot` tests cover pending creation with no registered session and
  disappearance after settlement.
- Plain-workspace and branch-workspace panel tests cover mounting the terminal
  surface during first-terminal creation.
- Run targeted tests, typecheck, the full suite, and the architecture check.

## Non-goals

- Do not change the existing localized “Opening terminal…” copy or styling.
- Do not disable terminal creation or change server creation semantics.
- Do not add placeholder sessions, persistence, or cross-window synchronization.
- Do not change terminal recovery or restart loading behavior.

## Grill findings

- A boolean lock would clear too early when creation requests overlap, so the
  registry owns an internal count and exposes only the derived boolean.
- Component-local pending state would duplicate behavior across Git branch,
  plain workspace, and branch workspace entry points.
- An optimistic placeholder session would require speculative IDs and rollback,
  which is unnecessary for a presentation-only status.
- The change is local and reversible, so it needs neither an ADR nor a glossary
  update.
