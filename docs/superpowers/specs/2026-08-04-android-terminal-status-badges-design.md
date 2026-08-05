# Android Terminal Status Badges Design

## Goal

Make retained terminal status immediately distinguishable in the Android Terminals tab without covering each card in a heavy status color.

## Scope

- Supersede only the terminal-card color and background requirements in `2026-07-28-android-list-prompts-private-key-export-design.md`; its other requirements remain unchanged.
- Replace status-specific card backgrounds with a high-emphasis status badge in each card header.
- Preserve the existing localized status text inside the badge so status is not communicated by color alone.
- Use green for running, red for disconnected or failed, gray for exited, and a neutral treatment for starting.
- Keep terminal lifecycle state, ordering, navigation, close, reconnect, and delete behavior unchanged.
- Do not add animation, new status values, user-configurable colors, or changes outside the Android Terminals tab.

## Presentation

The existing status text at the right side of the terminal card title row becomes a compact filled badge. The card itself uses the normal themed surface, keeping the list calm while concentrating the stronger semantic color where users scan for status.

| Terminal status | Badge treatment | Meaning |
| --- | --- | --- |
| `Running` | Solid success green with high-contrast text | The controller is connected and active. |
| `Disconnected` | Solid themed error red with its matching contrast text | The connection or Android controller path was lost; remote work may still exist. |
| `Failed` | Solid themed error red with its matching contrast text | Terminal startup or operation failed. |
| `Exited` | Adaptive gray derived from the current theme with normal surface text | The terminal is known to have ended, including an explicit close. |
| `Starting` | Neutral themed container and secondary text | Connection startup is still in progress. |

The badge keeps the existing compact label and single-line truncation. Its padding and rounded shape follow existing Material theme primitives.

## Architecture

This remains a renderer-only Compose presentation change in `TerminalsScreen.kt`. The existing `TerminalSessionStatus` remains authoritative; a pure tone projection groups `Disconnected` and `Failed` into the same alert tone while retaining separate localized labels. No terminal manager, persistence, transport, or service behavior changes.

## Accessibility and Themes

- Text remains present for every status, so red/green perception is not required.
- Running and alert badges use explicit foreground/background pairs with strong contrast.
- Exited gray is composed from the active theme rather than fixed light- or dark-only values.
- The neutral card surface and compact badge avoid large saturated areas across long terminal lists.

## Testing

- A state test verifies running, alert, exited, and starting statuses project to distinct intended tones, with disconnected and failed sharing the alert tone.
- A source contract verifies the title row renders the dedicated status badge and cards no longer use state-specific background colors.
- Run the focused Android unit test, then the repository-required verification commands.

## Acceptance Criteria

1. Each Android Terminals-tab card shows a filled status badge in its title row.
2. Running is visibly green; disconnected and failed are visibly red; exited is visibly gray; starting remains neutral.
3. Every badge retains its localized text label.
4. Card backgrounds no longer carry the primary status signal.
5. Terminal lifecycle and actions are unchanged.
