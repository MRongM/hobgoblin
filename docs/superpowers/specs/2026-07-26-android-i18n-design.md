# Android i18n Design

## Goal

Localize the native Android application-owned interface in English, Simplified Chinese, Japanese, and Korean while preserving raw operational data exactly as received.

## Scope

- Translate Android navigation, screens, dialogs, validation fallback copy, accessibility descriptions, terminal chrome, and foreground-terminal notifications.
- Use English as the complete default resource set and provide complete Simplified Chinese, Japanese, and Korean resource sets.
- Follow the device language by default. On Android 13 and later, expose the supported languages through Android's per-app language settings.
- Keep desktop/Web i18n unchanged.
- Do not translate terminal output, commands, paths, branch names, repository titles, host names, protocol identifiers, or raw Git/SSH/Termux diagnostic details.
- Do not add an in-app language picker or a new dependency.

## Considered Approaches

### Android resource localization — selected

Store application copy in `res/values*/strings.xml`, resolve it with Compose `stringResource` or `Context.getString`, and let Android select the locale. This matches platform behavior, works offline, supports formatted strings and plurals, and avoids parallel language state.

### Kotlin dictionary

A Kotlin map would be easy to call from pure helpers, but it would recreate locale negotiation, fallback, formatting, and configuration invalidation. It is rejected as unnecessary infrastructure.

### Reuse the desktop/server i18n snapshot

Sharing the existing TypeScript dictionaries would align keys across products, but would couple native startup and notification copy to a separate runtime and transport. Android must remain usable before a server connection exists, so this is rejected.

## Architecture

The Android application owns a complete default `strings.xml` plus locale-qualified peers. Compose code resolves copy at the presentation edge with `stringResource`; Android services resolve copy with `Context.getString`. Pure domain and transport models remain locale-independent. Where existing pure helpers mix state decisions with English rendering, state selection remains pure and resource resolution moves to the closest UI or notification boundary.

`generateLocaleConfig = true` and `res/resources.properties` declare English as the unqualified locale. The generated locale configuration exposes English, Simplified Chinese, Japanese, and Korean to Android 13+ system settings without a manual manifest locale list.

## Data Flow

1. Android selects the application locale from the per-app preference or device locale.
2. Compose recomposition and Android resource lookup select the matching strings.
3. Dynamic values such as counts, paths, titles, and numeric ranges are passed as positional formatting arguments.
4. Unsupported locales and missing translated entries fall back to the complete English resource set.

No language preference is sent to Hobgoblin's server and no renderer i18n state is introduced on Android.

## Error Handling

Application-authored fallback messages are localized. Raw exception and remote diagnostic messages remain unchanged so actionable command, path, and protocol details are not corrupted. UI combines a localized context label with raw detail only when both are useful.

## Testing

- A JVM contract test verifies that every localized resource file has exactly the default string/plural keys and that the supported locale configuration remains enabled.
- Existing state tests continue to cover locale-independent decisions; presentation assertions move to resource contracts where needed.
- Android unit tests, lint, and debug assembly validate resource references and detect remaining hardcoded UI copy.
- Root TypeScript checks run afterward to ensure Android changes do not disturb existing architecture boundaries.
