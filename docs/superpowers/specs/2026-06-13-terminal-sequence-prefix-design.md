# Terminal Sequence Prefix Design

## Goal

Terminal tabs should always show the terminal sequence number, even when the running shell or process provides a custom terminal title. Users should be able to distinguish `terminal-1`, `terminal-2`, and later sessions at a glance.

## Scope

In scope:

- Prefix terminal tab display titles with the existing terminal index.
- Use the format `#1 zsh`, `#2 npm run dev`, and `#3 terminal 3`.
- Apply the same prefix to compact tab labels, collapsed dropdown labels, full titles, ARIA labels, and close confirmation copy through the existing `TerminalSessionSummary` fields.
- Keep `originalTitle` unchanged so tooltip detail can still expose the terminal-provided title without decoration.
- Use the existing `TerminalDescriptor.index` as the source of truth.

Out of scope:

- Server API or shared schema changes.
- Changes to terminal session keys, `terminal-N` parsing, tmux session names, or remote terminal behavior.
- Changes to drag sorting or `displayOrder`.
- User preferences for hiding or changing the prefix format.

## Architecture

Add the sequence prefix at the `TerminalSessionRegistry` summary boundary. This is the narrowest point where all terminal UI surfaces already receive their display title.

`TerminalSessionRegistry.sessionSummaries()` currently builds `TerminalSessionSummary` from each managed session snapshot. It already has both `session.descriptor.index` and the derived title values. The implementation should generate display titles through small helper functions:

- `formatTerminalSequencePrefix(index)` returns `#<index>`.
- `withTerminalSequencePrefix(index, title)` returns `#<index> <title>`, falling back to `#<index> terminal <index>` when the title is empty.

This keeps UI components simple. `TerminalTabs` continues rendering `session.title`, `session.fullTitle`, and `session.originalTitle` without knowing how the display title is composed.

## Display Rules

For a session with `index = 2`:

- Canonical title `~/repo/app — npm run dev` compacts to `repo · npm run dev`, then displays as `#2 repo · npm run dev`.
- Process name `zsh` displays as `#2 zsh` when no canonical title exists.
- Empty title and empty process name displays as `#2 terminal 2`.
- `fullTitle` uses the same prefix and full un-compacted title source: `#2 ~/repo/app — npm run dev`.
- `originalTitle` remains `~/repo/app — npm run dev`.

The prefix should be part of the visible string so it is available in normal tab text, compact dropdown text, close confirmation text, and accessible labels.

## Error Handling

No new error paths are introduced. If a descriptor index is missing or invalid in future code, the existing descriptor construction should continue to supply `1` as the fallback through current parsing logic.

## Testing

Focused coverage should include:

- A session with a canonical title displays `#N <compact title>` in `TerminalSessionSummary.title`.
- The same session displays `#N <full title>` in `TerminalSessionSummary.fullTitle`.
- `originalTitle` remains undecorated.
- A session without a canonical title displays `#N <process name>`.
- A session without title or process name displays `#N terminal N`.
- Existing tab/dropdown tests continue to pass because they consume the summary fields.

## Verification

Run:

```bash
bun run test src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalTabs.test.tsx
bun run typecheck
```
