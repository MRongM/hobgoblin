# Hob Terminal Command Display Design

## Goal

Update the General settings page so its terminal-open example presents the supported public CLI command:

```sh
hob /path/to/repo
```

## Selected approach

Change only the localized value of `settings.general.open-from-terminal-command` and its dictionary assertions. Keep the primary application and the independently maintained `windows/` package aligned across English, Simplified Chinese, Japanese, and Korean.

The existing `hob` launcher remains responsible for resolving the directory and delegating to Hobgoblin. This change does not modify the launcher, application startup, project import, packaging, installation, or settings UI structure.

## Alternatives considered

1. Update only the primary application. This is smaller initially but leaves the maintained `windows/` package with stale copy.
2. Update only Simplified Chinese. This makes the command inconsistent across locales and violates the dictionary test's shared-command contract.
3. Change the explanatory body text as well. The existing body already describes the user-facing behavior accurately, so this adds no value.

## Testing

- Change the shared-command assertions first and verify both dictionary tests fail against the old value.
- Update all eight localized command values.
- Run both focused dictionary tests.
- Run type checking, architecture checks, and full tests for the primary and independent packages.

## Self-review

- The design contains no placeholders or unresolved choices.
- Scope is limited to one displayed command and its direct tests.
- No domain vocabulary or architectural decision changes, so neither `CONTEXT.md` nor an ADR needs updating.
- No Git commit is included because the user did not authorize one.
