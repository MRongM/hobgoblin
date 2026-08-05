# Android Terminal Recency Design

## Goal

Put the newest retained terminal at the top of the Android Terminals tab and show when each terminal first entered the retained list.

## Confirmed Semantics

The ordering and displayed time both use `TerminalSessionRecord.openedAt`. This value is immutable across reconnects and status/activity changes. For a recovered tmux terminal, it represents when Android created the recovered retained record, not the unknown remote tmux creation time.

The user-facing copy describes this as the terminal's opened time. It must not claim to be last activity or most recent connection time.

## Considered Approaches

1. **Localized relative opened time — selected.** Sort by `openedAt` descending and show text such as “opened 5 minutes ago”. This matches the requested recency scan, uses the existing timestamp, and follows the app's current relative-time presentation.
2. **Absolute local date and time.** Precise but slower to scan and visually heavier on every card.
3. **Persist a new reconnect timestamp.** Would answer a different question and require model/store migration without being needed for newest-first initial-open ordering.

## Scope

- Supersede the stable creation-order requirements in `2026-07-28-android-list-prompts-private-key-export-design.md` and the ordering-preservation clause in `2026-08-04-android-terminal-status-badges-design.md`; their other requirements remain unchanged.
- Change only the Android main-navigation Terminals tab to `openedAt` descending.
- Keep ID ascending as the deterministic tie breaker when timestamps match.
- Show one muted, localized opened-time line on every Terminal card.
- Render each Terminal item as an outlined card while retaining the existing inter-card spacing, so adjacent neutral cards remain clearly separated in every theme.
- Add aligned English, Simplified Chinese, Japanese, and Korean string resources.
- Preserve status badges, card actions, terminal identity details, lifecycle state, persistence format, Project terminal ordering, and terminal cycling behavior.
- Do not add a refresh timer, new timestamp field, setting, manual order, or server synchronization.

## Presentation

The opened-time line appears in the card metadata below the terminal location and before optional terminal identity details. It uses the small label typography and `onSurfaceVariant`, keeping the title, status badge, path, and actions visually dominant.

Each item uses the existing Material outlined-card primitive with the normal themed surface. The current small vertical gap remains; no redundant divider or heavy elevation is added.

Android's locale-aware relative-time formatter supplies the time phrase with minute-level resolution. Older timestamps may naturally become locale-formatted dates according to Android behavior. The text is recomputed when the card recomposes; this change does not introduce a minute ticker.

## Architecture

`terminalOverviewOrderedSessions` remains the pure presentation projection for the main Terminals tab and gains its own descending comparator. The existing ascending comparator remains unchanged for Project/workspace terminal surfaces.

`TerminalsScreen.kt` wraps the formatter output in a focused localized-text helper, then renders it in `TerminalOverviewRow`. No terminal manager or store changes are required.

## Testing

- Update ordering tests to prove newest-first order across Host and Project sessions.
- Preserve tests proving status/activity changes do not reorder items and IDs break equal-time ties deterministically.
- Add a pure localized-text test plus a source contract proving the opened-time line uses `openedAt` and Android's locale-aware relative formatter.
- Extend the source contract to require an outlined card and preserve the existing inter-card spacing.
- Verify all maintained locale resources remain aligned.
- Run focused Android tests, the complete Android unit suite, Lint, debug assembly, and root repository checks.

## Acceptance Criteria

1. The Android Terminals tab displays the greatest `openedAt` first.
2. Status and activity changes do not alter the order.
3. Equal timestamps use ascending session ID as a deterministic tie breaker.
4. Every Terminal card displays its localized opened time.
5. Adjacent Terminal cards have a visible themed outline and retain their existing spacing.
6. Reconnect does not change the timestamp or move the retained item.
7. Project terminal lists and terminal lifecycle behavior remain unchanged.
