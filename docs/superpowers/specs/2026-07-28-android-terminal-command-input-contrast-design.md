# Android Terminal Command Input Contrast Design

## Goal

Make entered text in the Android terminal command input immediately readable and make the input field visually distinct from the surrounding command deck in both terminal appearances.

## Root Cause

`TerminalCommandDeck` and `CompactCommandInput` both render with `TerminalPalette.surfaceArgb`. The input therefore has no independent fill layer, while the palette has no explicit contract for command-input text contrast. Its divider is the only boundary, so the field can blend into the deck even though ordinary terminal foreground text is comparatively bright.

## Selected Direction

Use the approved **independent input surface** treatment:

| Appearance | Input background | Input foreground | Border |
| --- | --- | --- | --- |
| Dark | `#223044` | `#F7FAFC` | `#65B9FF` |
| Light | `#FFFFFF` | `#111820` | `#246EA8` |

The border is 2dp in both appearances. Placeholder and disabled text continue to use the existing muted terminal color so state semantics stay consistent.

## Architecture

Extend `TerminalPalette` with command-input-specific background and foreground values. `TerminalAppearance.kt` remains the single source of terminal palette values, and `CompactCommandInput` consumes those values through the existing `LocalTerminalPalette` boundary.

Reuse `actionArgb` for the border and cursor. This avoids introducing a duplicate accent token and keeps command-input emphasis aligned with existing terminal actions.

No application theme, terminal emulator, SSH, persistence, navigation, state ownership, or input behavior changes are required.

## Component Behavior

- Enabled entered text uses the dedicated input foreground.
- The input fill uses the dedicated input background.
- The border uses the terminal action color at 2dp.
- The cursor continues to use the terminal action color.
- Placeholder and disabled text continue to use `mutedArgb`.
- Sending, IME actions, selection state, visibility, and disabled-state rules remain unchanged.

## Error Handling

There is no new runtime error path. Both `TerminalAppearance` variants define complete palette values at compile time, and unknown persisted appearance values continue to fall back to Dark through the existing parser.

## Testing

- Extend palette tests with the exact input background and foreground values for Dark and Light.
- Add contrast assertions for enabled text against its input background.
- Add boundary contrast assertions for the action-colored border against the command-deck surface.
- Add a focused contract assertion that `CompactCommandInput` consumes the dedicated input tokens and renders the 2dp border.
- Run the focused Android test first, then the full Android suite and the repository verification commands required by `AGENTS.md`.

## Acceptance Criteria

- Dark and Light terminal appearances both show a clearly separated command input.
- Entered text has high contrast against the input background.
- The input boundary is visibly stronger than the previous 1dp divider treatment.
- Placeholder and disabled styling remain distinguishable from enabled entered text.
- Terminal input and session behavior are unchanged.
- Focused and full verification pass.

## Engineering Principles

- **KISS:** change only terminal palette data and the command-input renderer.
- **YAGNI:** do not add theme customization, focus animation, or new dependencies.
- **DRY:** reuse the existing action token for border and cursor emphasis.
- **SOLID:** keep palette definition separate from Compose rendering and runtime terminal behavior.

