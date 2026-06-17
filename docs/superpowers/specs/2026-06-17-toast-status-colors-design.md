# Toast Status Colors Design

## Scope

Update the global right-bottom toast styling so each Sonner status uses a soft semantic color block:

- Success uses green.
- Error uses red.
- Info uses a quieter green than success.
- Warning uses yellow.
- Loading uses pale yellow.

This is a visual-only change. It must not change toast position, duration, close button behavior, toast call sites, translated copy, or repo action result handling.

## Existing Context

The app renders one global toaster from `src/web/App.tsx`:

```tsx
<Toaster position="bottom-right" closeButton />
```

The visual contract lives in `src/web/components/ui/sonner.tsx`. That wrapper already owns the theme integration, Lucide status icons, Sonner CSS variable hooks, toast width, and long-description overflow handling.

Current state styling keeps toast bodies neutral and only colors state icons/text through Sonner CSS variables. The requested design should keep the existing wrapper and move state styling to soft semantic backgrounds and borders.

## Design

Implement the selected "soft color block" direction inside `src/web/components/ui/sonner.tsx` by updating Sonner's per-state CSS variables.

Use the existing theme contract tokens instead of hard-coded state colors:

- `--color-success`, `--color-success-surface`, `--color-success-border`
- `--color-danger`, `--color-danger-surface`, `--color-danger-border`
- `--color-warning`, `--color-warning-surface`, `--color-warning-border`

Recommended mapping:

| Status | Background | Text and icon | Border |
| --- | --- | --- | --- |
| success | `--color-success-surface` | `--color-success` | `--color-success-border` |
| error | `--color-danger-surface` | `--color-danger` | `--color-danger-border` |
| info | `--color-success-surface` | `--color-success` | `--color-success-border` |
| warning | `--color-warning-surface` | `--color-warning` | `--color-warning-border` |
| loading | `--color-warning-surface` | `--color-warning` | `--color-warning-border` |

Info intentionally uses the success color family because the requested direction says info can be green. It remains semantically distinct through the existing info icon and calling context. Loading uses the warning family because it should read as pale yellow.

No new component, hook, or toast wrapper should be introduced. The existing `toast.success`, `toast.error`, and related Sonner APIs continue to work unchanged.

## Error Handling

No error-handling behavior changes. Existing repo event toasts, settings notification test toasts, copy failure toasts, and diagnostic copy toasts continue using their current success/error APIs and durations.

Long descriptions continue to rely on existing toast class names:

- `content`: constrained and overflow-hidden
- `description`: constrained and overflow-hidden
- repo result descriptions: scrollable `ToastDescription`

## Testing

Run focused verification for the global wrapper and broad project checks:

```bash
bun run typecheck
bun run test
```

If the current unrelated merge conflict in `src/system/ssh/git.test.ts` blocks `bun run test`, run the nearest focused web tests that do not depend on the conflicted file and report the blocker explicitly.

## Principles

- KISS: one wrapper-level styling change.
- DRY: all toast call sites inherit the same status contract.
- YAGNI: no new notification abstraction.
- SOLID: `src/web/components/ui/sonner.tsx` remains the single owner of toaster presentation.
