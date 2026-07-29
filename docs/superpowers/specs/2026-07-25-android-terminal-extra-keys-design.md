# Android Terminal Extra Keys Design

## Goal

Make the Android terminal's first two command-deck rows follow the familiar Termux extra-key layout, retain Hobgoblin-specific shortcuts and actions in a third row, prioritize reconnect, and make Hosts the initial main tab.

## Product behavior

### Termux-compatible extra-key rows

The command deck starts with two horizontally scrollable rows in this exact order:

```text
ESC  /  -  HOME  ↑  END  PGUP
TAB  CTRL  ALT  ←  ↓  →  PGDN
```

- `ESC`, `/`, `-`, `TAB`, arrows, `HOME`, `END`, `PGUP`, and `PGDN` send their normal terminal input.
- `CTRL` and `ALT` are one-shot modifiers. Their active state is visible in the label and is consumed by the next standard extra key or terminal text input.
- Pressing an active modifier again cancels it.
- Existing explicit `CTRL+C` and `CTRL+L` shortcuts remain direct actions and clear active modifiers after sending.
- Standard navigation keys use the existing Termux `KeyHandler` translation so cursor application mode and modifier escape sequences remain correct.

### Hobgoblin action row

The third row remains horizontally scrollable and contains Hobgoblin's existing terminal shortcuts and presentation operations. It starts with a stable `Reconnect` position, followed by input shortcuts, terminal switching controls, and presentation actions.

`Reconnect` is always rendered:

- idle, exited, failed, or disconnected: enabled in the normal terminal action color;
- connecting, connected, or resizing: disabled with the existing muted style.

Keeping the button fixed prevents layout shifts and makes recovery discoverable. It remains a non-destructive action and does not move into the top app bar.

### Initial main tab

Every ordinary app launch starts on the Hosts tab, regardless of whether saved Projects exist. An explicit terminal navigation request may still immediately navigate to its requested retained terminal.

## Architecture

- `TerminalInteractionState.kt` owns the pure extra-key definitions, row order, and labels; `TerminalInputTranslator.kt` owns byte translation.
- `TerminalScreen.kt` owns one-shot modifier UI state and renders the two standard rows plus the third Hobgoblin action row.
- The existing terminal view boundary receives the one-shot modifier state for software-keyboard text, consumes it after successful input, and continues to translate physical keys from their real modifier flags.
- `AppRoute.kt` exposes the pure initial-route decision; `HobgoblinAndroidApp.kt` uses it when creating local route state.
- No persistence, SSH, session ownership, server, dependency, or desktop/web behavior changes.

## Error and state handling

- All extra input remains disabled when terminal input is unavailable.
- A failed send keeps existing terminal feedback behavior; modifier state is consumed only when an input attempt is made, matching one-shot keyboard behavior.
- Changing sessions or terminal destinations clears active modifiers so they cannot leak into another session.
- Reconnect availability continues to come from `terminalReconnectAvailable`; only placement and stable visibility change.

## Verification

- Unit tests assert the exact two Termux row orders, modifier labels, key byte sequences, one-shot text translation, third-row reconnect ordering, and Hosts initial route.
- Existing terminal input, interaction-state, navigation, and Android unit tests remain green.
- Run Android unit tests with `./gradlew :app:testDebugUnitTest` from `android/`.
- Run repository validation with `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root.
