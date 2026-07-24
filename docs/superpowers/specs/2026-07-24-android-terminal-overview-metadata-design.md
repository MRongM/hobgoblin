# Android Terminal Overview Metadata Design

**Date:** 2026-07-24

**Status:** Approved for autonomous inline implementation

## Summary

Enrich each Android terminal list item with compact terminal identity metadata. This applies both to the global `Terminals` overview and to terminal rows inside a Project. Every item shows whether the retained record is `tmux` or `native` and an eight-character Android session ID. A tmux-backed item additionally shows its complete current-protocol tmux session name.

## Goals

- Make terminal kind visible without opening the terminal.
- Make retained Android records distinguishable when display names and paths are similar.
- Expose the exact tmux session name needed to correlate a recovered record with remote tmux state.
- Keep identity details consistent between the global overview and Project terminal lists.
- Preserve exact Android/Desktop tmux v1 session-name compatibility.
- Preserve the current compact, read-only terminal overview.

## Non-goals

- Adding copy actions, expandable rows, filtering, grouping, or search.
- Showing transport internals, host fingerprints, repository IDs, or full Android UUIDs.
- Changing terminal persistence, launch behavior, recovery, connection status, or navigation.
- Reclassifying a tmux-backed record by probing the current remote process.

## Approaches Considered

### 1. Shared inline summary with tmux-only detail — selected

Add one shared compact presentation containing `<kind> · session <short-id>`. Add a second wrapping line containing `tmux session: <full-name>` only when the record has a current tmux identity. Reuse it in both terminal list surfaces. This is directly scannable, requires no interaction state, and keeps native rows concise.

### 2. Expandable diagnostics

Keep rows unchanged until tapped or expanded, then show all identifiers. This reduces initial density but introduces state and a competing tap target into an overview whose primary action is opening the terminal.

### 3. Put all metadata into the existing context line

Append kind and identifiers to the target label. This minimizes layout code but mixes location with identity, truncates useful data earlier, and makes the information harder to scan.

### 4. Duplicate the identity markup in each list

Render the same text independently in the global and Project rows. This is locally smaller but allows typography, wrapping, and copy to drift, so it is rejected in favor of one terminal-feature component.

## Presentation

The global overview item order remains:

1. retained display name and lowercase connection status;
2. target label and path context;
3. compact identity summary;
4. complete tmux session name when present;
5. existing `Open` action.

The Project terminal row inserts the same identity presentation after its existing recent-activity line and before the `Open`/`Delete` actions. It does not repeat the target path because the enclosing Project terminal panel already identifies the selected workspace path.

The identity summary uses lowercase `tmux` or `native`, followed by `session` and the first eight characters of `TerminalSessionRecord.id`. IDs shorter than eight characters remain unchanged. Labels remain textual rather than relying on color alone.

The tmux detail uses the exact `TmuxSessionIdentity.sessionName` without abbreviation. It may wrap on narrow screens. Native records do not render an empty tmux detail line.

Both identity lines use the platform monospace family because they contain identifiers that users compare character-by-character. Colors, shapes, title typography, and spacing continue to use the existing Material 3 theme.

## Classification

`tmuxIdentity != null` classifies the retained record as `tmux`; otherwise it is `native`. This follows the existing domain definition: a terminal assigned a current-protocol tmux identity remains tmux-backed even when the preference changes, the session disconnects, or the live tmux session later disappears.

The Android record ID and the remote tmux session name remain distinct:

- the short Android session ID identifies the retained application record;
- the full tmux session name identifies the deterministic remote tmux session.

No new domain or persistence fields are introduced.

Android continues to generate the remote name from the same descriptor and algorithm as Desktop: lexically normalized `projectRoot`, lexically normalized `workingDirectory`, and a positive terminal number are joined after `hobgoblin-terminal-session-v1` with NUL separators, hashed as UTF-8 with SHA-256, and truncated to 24 lowercase hexadecimal characters after the `hobgoblin-v1-` prefix. The public descriptor vector remains `hobgoblin-v1-aebf050981ac829e36100020` on both platforms.

## Architecture

Pure projection helpers and a small shared Compose renderer in `TerminalSessionDetails.kt` derive and display identity data from `TerminalSessionRecord`. Both `TerminalOverviewRow` and the Project screen's `TerminalSessionRow` consume that renderer. The application, terminal manager, store, SSH adapter, and tmux protocol remain unchanged.

## Error and Edge Cases

- A nonblank session ID always produces a nonempty short ID.
- A native or temporary Host terminal never shows a tmux session line.
- A recovered tmux record and an explicitly created tmux record use the same presentation.
- The global overview and Project terminal rows use identical identity copy, typography, and wrapping.
- Long target labels retain their existing two-line ellipsis behavior.
- The complete tmux name wraps within the card rather than widening it.

## Testing

- Unit tests cover native and tmux classification.
- Unit tests cover eight-character ID shortening and IDs already shorter than eight characters.
- Unit tests prove the exact full tmux session name is returned only for tmux-backed records.
- A Project screen contract test proves Project terminal rows include the shared identity renderer.
- The existing Android public-vector test guards tmux name-generation compatibility.
- Focused tests run first, followed by Android unit tests, lint, and debug assembly.

## Safety and Compatibility

- The change is read-only and Android-only.
- Existing records render without migration.
- No shell command, remote state, terminal lifecycle, or dependency changes.
- Existing title, context, status, ordering, navigation, and `Open` behavior remain unchanged.
