# README Theme Screenshots Design

**Goal:** Replace the two existing README screenshots with a consistent six-image showcase for the `macos`, `signal`, and `tokyo-night` presets in light and dark appearance.

## Scope

- Capture one identical Hobgoblin workspace scene for every preset/appearance combination.
- Add six PNG assets under `docs/screenshots/`.
- Update `README.md`, `README.zh-CN.md`, `README.ko.md`, and `README.ja.md` so every language presents the same images.
- Keep the two legacy screenshot files unchanged; deleting them is outside this task.
- Do not change application code, theme tokens, dependencies, or runtime behavior.

## Capture Design

The scene uses an isolated, disposable Git repository with generic project, branch, file, and author names. It shows the desktop workspace at a fixed 16:9 viewport with repository navigation, worktree state, file browsing, and a useful detail or terminal surface visible. Every capture uses the same repository state and layout, so the only intentional differences are the color preset and light/dark appearance.

The six assets are:

- `docs/screenshots/macos-light.png`
- `docs/screenshots/macos-dark.png`
- `docs/screenshots/signal-light.png`
- `docs/screenshots/signal-dark.png`
- `docs/screenshots/tokyo-night-light.png`
- `docs/screenshots/tokyo-night-dark.png`

Screenshots must not expose real usernames, home paths, email addresses, tokens, or private repository identifiers. Browser automation runs against an isolated Hobgoblin server data directory so existing user settings and projects are not imported into the capture.

## README Layout

The Screenshots section has three labeled subsections in this order:

1. macOS
2. Signal
3. Tokyo Night

Each subsection renders its light and dark images side by side at `49%` width. Alt text is localized and names both the preset and the appearance. The structure stays plain HTML inside Markdown for reliable GitHub rendering.

## Validation

- All six files are non-empty PNG images with identical dimensions.
- All four README files reference all six assets and no longer reference the two legacy screenshot paths.
- A repository-wide search finds no personal capture data in the modified README text or filenames.
- `bun run typecheck` and `bun run test` remain green because the task changes documentation assets only.

## Engineering Principles

- **KISS:** use one repeated two-column HTML pattern and one stable capture scene.
- **YAGNI:** do not add a screenshot framework or application-only demo mode.
- **DRY:** reuse the same six assets across all localized README files.
- **SOLID:** keep documentation assets separate from application runtime code.
