# Built-in Terminal Button Presets Design

## Goal

Ship the first seven entries from the current custom terminal button list as built-in terminal button presets. Presets use localized labels and sent text for Hobgoblin's four supported application languages: English, Simplified Chinese, Japanese, and Korean.

The final two entries from the current list are intentionally excluded. Existing user button lists, including an explicitly empty list, remain authoritative and are never overwritten by an upgrade.

## Scope

- Add seven built-in presets in their current order.
- Preserve each preset's current action: the first four use `execute`; the final three use `input`.
- Resolve preset labels and sent text through the current application language.
- Let users reorder, remove, and edit presets through the existing terminal settings UI.
- Turn a preset into an ordinary custom button when its label, sent text, or action is edited.
- Seed presets only for a new settings store or a legacy settings file that has never contained `terminalCustomButtons`.

## Non-goals

- Do not restore a preset after the user removes it.
- Do not replace or merge an existing `terminalCustomButtons` array.
- Do not infer preset identity from an existing custom button's text.
- Do not translate terminal output, repository data, branch names, or shell diagnostics.
- Do not add these server-backed desktop/web custom buttons to Android's separate native command deck.
- Do not add preset groups, a reset-to-defaults action, synchronization, new APIs, or a new realtime path.

## Preset catalog

The catalog contains stable preset identities, order, action, English fallback text, and translation keys. The Chinese translation preserves the current first-seven button content.

| Preset identity        | Chinese label | Action    |
| ---------------------- | ------------- | --------- |
| `confirm-continue`     | `确认、继续`  | `execute` |
| `try-if-needed`        | `试试、需要`  | `execute` |
| `show-progress`        | `进度`        | `execute` |
| `autonomous-decisions` | `自主决策`    | `execute` |
| `commit-and-push`      | `提交、推送`  | `input`   |
| `ship-release`         | `提推合发更`  | `input`   |
| `batch-operations`     | `批量操作`    | `input`   |

The catalog is application-owned and privacy-safe. It contains no environment-specific paths, credentials, account names, pipeline identifiers, or deployment targets beyond the generic wording already present in the included entries.

## Data model and ownership

`TerminalCustomButton` gains an optional `presetId` whose value is restricted to the seven known identities. Existing literal buttons remain valid without migration:

```ts
interface TerminalCustomButton {
  label: string
  value: string
  action?: 'execute' | 'input'
  presetId?: TerminalCustomButtonPresetId
}
```

The server remains the source of truth for the ordered settings array. It validates and preserves a known `presetId`; an unknown identifier is discarded while its valid literal label, value, and action remain an ordinary custom button. This fail-open behavior preserves usable user data across malformed or newer settings files.

The renderer owns language projection. A shared pure resolver accepts one button and a translator. For a known preset it returns the localized label and sent text while preserving the stored action. For an ordinary custom button it returns the literal data unchanged.

No additional settings field, query, mutation, state owner, transport route, invalidation event, or stream is introduced.

## Defaults and upgrade behavior

The default settings factory returns fresh copies of the seven preset-backed buttons so callers cannot share mutable default objects.

Settings loading distinguishes three cases:

1. No settings file: create the ordinary defaults with all seven presets.
2. A settings file without a `terminalCustomButtons` property: seed all seven presets as a legacy upgrade.
3. A settings file with `terminalCustomButtons`, including `[]`: normalize and preserve that explicit list without injecting presets.

Existing literal buttons are not matched by label or value and are not silently converted into presets. This avoids changing language behavior for user-authored content that happens to resemble a built-in entry.

## Language behavior

Each preset has a label key and a sent-text key in all four dictionaries. Dictionary parity tests continue to require the same keys in English, Simplified Chinese, Japanese, and Korean.

`TerminalSlot` resolves the ordered array during render. A language change therefore updates the visible label, tooltip, and text sent by the next click without writing settings.

`TerminalSettings` resolves presets when creating editable rows. Reordering and deletion retain the preset identity. Changing the label, sent text, or action removes that identity before the row is saved, freezing the user's edited text as a custom button. The current Save interaction remains unchanged.

If the settings page is clean, a language change refreshes its preset rows. If it has unsaved edits, existing dirty-state behavior wins and the refresh does not overwrite those edits; reopening the page after saving or discarding shows the current language.

## Interaction and safety

Button execution semantics do not change:

- `execute` writes the localized sent text followed by carriage return, then restores terminal focus.
- `input` writes the localized sent text without carriage return, then restores terminal focus.
- Buttons remain visible only to the controlling terminal attachment when the custom-button bar is enabled.

The three prompts that describe Git or release writes remain `input` actions, so the button itself never submits those write requests. This feature does not bypass Hobgoblin or agent confirmation rules for destructive Git, filesystem, network, or release operations.

## Error handling

- Unknown preset identifiers degrade to valid literal custom buttons.
- Invalid or empty labels and values continue to be filtered by the existing normalization rules.
- Missing translation keys are prevented by dictionary key parity and dedicated preset catalog tests; normal i18n English fallback remains available at runtime.
- A failed settings save retains the current settings page behavior and does not mutate the server snapshot.

## Testing

Use test-driven development for each behavior:

- Shared tests prove the exact seven-entry order, action modes, stable identities, translations in all four languages, ordinary-button passthrough, and unknown-preset fallback.
- Settings default tests prove fresh preset arrays are returned.
- Settings source tests prove missing-property seeding, explicit-empty preservation, known-ID persistence, and unknown-ID removal without losing literal button data.
- Terminal settings tests prove translated display, preset preservation during reorder, preset removal after editing, and ordinary custom button behavior.
- Terminal slot tests prove the localized value is sent with the existing `execute`/`input` carriage-return behavior.
- Full verification runs `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Principles

- KISS/YAGNI: one optional identifier and one pure catalog/resolver; no parallel built-in-button collection or reset workflow.
- DRY: order, actions, identities, fallback text, and translation keys live in one catalog.
- SOLID: shared code owns preset identity and projection, the settings source owns persistence normalization, and renderer components retain their existing interaction responsibilities.
