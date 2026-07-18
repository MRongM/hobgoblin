# Mobile Focus Workspace Design

**Date:** 2026-07-18
**Status:** Approved for autonomous execution

## Subject, audience, and job

Hobgoblin mobile is a remote cockpit for developers supervising and steering AI CLI sessions away from their desk. The page has one primary job: keep the selected worktree terminal usable at phone width while project, branch, and file navigation remain one deliberate action away.

## Problem

Compact UI currently preserves the desktop-style global repository tab bar and renders the repository workspace as a top/bottom split. That spends scarce vertical space on global chrome and makes the terminal a secondary pane. Inside the explorer, the compact `top-bottom` layout produces a horizontal branch/file split whose two minimum widths do not fit a phone reliably.

The existing `detailFocusMode` cannot be used as the mobile default. It is restorable session state; mutating it in response to viewport width would let a phone visit change the next desktop layout.

## Explored approaches

### 1. Local compact focus presentation — selected

Treat compact navigation as two local renderer surfaces: terminal detail by default, workspace explorer on demand. Reuse the focus-mode project and branch controls in the detail toolbar, and reuse the existing explorer in a vertically stacked arrangement.

Benefits: terminal-first, no persisted-state contamination, reuses established controls, and keeps desktop behavior unchanged. Cost: a small amount of component-local navigation plumbing.

### 2. Automatically enable `detailFocusMode`

This is the smallest render diff, but it writes restorable state and causes responsive behavior to leak across device classes. Rejected.

### 3. Add a permanent mobile bottom navigation bar

This would make every destination explicit, but duplicates the explorer tab model, consumes terminal height, and creates a second navigation vocabulary. Rejected as YAGNI.

## Visual direction

### Palette

No new theme is introduced. The compact surface derives from the active project theme. The representative macOS dark mapping is:

- **Terminal canvas** `#000000` — primary working surface.
- **Context rail** `#1F3044` — one compact control band.
- **Rail boundary** `#243247` — separates controls from terminal output.
- **Active signal** `#2997FF` — selected/focus semantics only.
- **Primary text** `#FFFFFF` — active project/session labels.
- **Secondary text** `#CCCCCC` — utility context.

Every value is consumed through existing semantic tokens such as `bg-detail`, `bg-toolbar`, `border-toolbar-border`, `text-toolbar-foreground`, and `text-muted-foreground`; other themes retain their own values.

### Type

- **Interface/context role:** the configured global UI face through `var(--font-sans)`, using the existing compact uppercase/tracked project label as a restrained identity marker.
- **Terminal/data role:** the configured terminal face through `var(--font-mono)` and the existing terminal renderer settings.
- **Utility role:** 10–12 px tracked or tabular text already used by branch and status metadata.

The terminal canvas is the hero; no display headline or decorative typography is added.

### Layout and signature

The signature element is a single top **context rail** that reads from broad to specific: workspace → project → branch → terminal session. It replaces the generic global repository tab bar only for available Git repositories in compact mode.

```text
DETAIL (default)
┌──────────────────────────────────────┐
│ [workspace] [PROJECT⌄] [branch⌄] [session⌄] │
├──────────────────────────────────────┤
│                                      │
│          live terminal canvas        │
│                                      │
└──────────────────────────────────────┘

WORKSPACE (on demand)
┌──────────────────────────────────────┐
│ [PROJECT⌄]               [+] [terminal] │
├──────────────────────────────────────┤
│ branches / worktrees                 │
├──────────────────────────────────────┤
│ files · changes · status · history   │
│                                      │
├──────────────────────────────────────┤
│ settings · theme · terminal status   │
└──────────────────────────────────────┘
```

The aesthetic risk is removing the familiar mobile app topbar entirely while a Git workspace is available. The product-specific context rail carries only actionable repository/terminal context, so the gained terminal height justifies the risk.

## Interaction model

- Compact Git repositories with an available selected worktree open on the detail surface.
- The leading workspace button opens the explorer surface without mutating `detailFocusMode`, `detailCollapsed`, or session persistence.
- The explorer header's terminal button returns to detail.
- Selecting any branch from the explorer returns to detail. If the branch has no worktree, the explorer remains the useful surface because there is no internal terminal target.
- A terminal “reveal path” request opens the explorer and selects the Files tab through the existing reveal request flow.
- Switching projects from the context rail resets the local explorer-open state because the state is keyed by repository id.
- Unavailable and plain workspaces retain the existing compact topbar and recovery/navigation behavior.
- Viewport changes do not mutate restorable workspace state. Returning to desktop renders the existing desktop shell exactly as before.

## Component boundaries

- `App.tsx` owns whether global chrome is appropriate. It hides the compact global topbar only for available Git repositories.
- `RepoView.tsx` owns the local compact surface selection because it already composes explorer and detail panes.
- `BranchDetailToolbar.tsx` owns the compact context rail presentation and delegates the “show workspace” intent upward.
- `RepoExplorerPane.tsx` owns compact explorer composition: header, vertical branch/file split, and status bar.
- `SidebarProjectHeader.tsx` keeps project/open actions and accepts a compact “return to detail” intent.
- `TopbarRepoControls.tsx` accepts an explicit focus-presentation hint so it can render existing branch controls without reading a false persisted focus state.

No server, shared state, realtime, Electron main-process, or terminal-session ownership changes are needed.

## State and data flow

The new state is local interaction state in `RepoView`: the repository id whose compact explorer is open, or `null` for detail. It is neither runtime-coherent nor restorable.

1. Responsive mode and repository capability determine whether compact focus presentation is eligible.
2. `RepoView` renders detail by default when the selected branch has a worktree.
3. Toolbar/header callbacks switch the local surface.
4. Existing navigation actions continue to own project and branch selection.
5. Terminal sessions remain server-backed streaming state with no protocol change.

## Error and edge handling

- No selected branch or no worktree: show explorer instead of an empty terminal surface.
- Unavailable repository: retain global topbar and existing unavailable workspace UI.
- Plain workspace: retain current compact shell; it does not use Git branch focus presentation.
- Loading repository: use a detail-only compact skeleton so chrome does not jump from split to focus after hydration.
- Narrow labels: project and terminal labels truncate; controls remain icon-addressable and keep accessible names.

## Testing

- App shell hides compact global topbar only for available Git repositories.
- Compact `RepoView` starts on detail, toggles to explorer and back, falls back to explorer without a worktree, and leaves desktop split rendering unchanged.
- Compact detail toolbar renders project/branch/session context without requiring persisted focus mode; the workspace button calls only its local callback.
- Compact explorer uses a vertical branch/file split and renders its project header and status bar.
- Selecting a branch requests the compact detail surface.
- All new controls have accessible labels in English, Simplified Chinese, Japanese, and Korean.
- Run focused tests, `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

## Self-review

- Placeholder scan: no TBD/TODO or deferred behavior.
- Consistency: local surface state is used throughout; persisted focus/collapse state remains untouched.
- Scope: renderer-only mobile composition; no unrelated desktop or server refactor.
- Ambiguity: “mobile” means the existing compact breakpoint, `(max-width: 639px)`.
- Domain model: no glossary update or ADR is warranted. “Focus mode” remains the existing explicit/restorable workspace state; this feature is a responsive presentation, not a new domain state.

