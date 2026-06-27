# Goblin Origin Recommendation Design

## Intent

Add a small, visible acknowledgement that Goblin is the origin of Hobgoblin, and recommend Goblin as a focused, small project for users who want a lighter Git branch/worktree overview.

The recommendation should appear in:

- The repository README files.
- The GitHub Pages homepage at `docs/index.html`, which is published at `https://gh.328064.xyz/hobgoblin/`.

## Current Context

Hobgoblin already has multilingual public documentation:

- `README.md`
- `README.zh-CN.md`
- `README.ko.md`
- `README.ja.md`
- `docs/index.html`

The Pages homepage is a single static HTML file with inline CSS and an inline `i18n` dictionary for English, Simplified Chinese, Korean, and Japanese. It already uses the same visual structure and content lineage as Goblin's public page.

Goblin's public page at `https://nano-props.github.io/goblin/` describes Goblin as a macOS desktop app for managing Git branches and worktrees across multiple repositories. It focuses on branch/worktree visibility, PR context, commit logs, and quick Git actions in one window.

## Selected Approach

Use a low-key but visible "origin" recommendation.

README files get an `Origins` section after the productivity formula and before product features. The Pages homepage gets a lightweight recommendation band after `Features` and before `Install`.

This keeps Hobgoblin's main positioning intact while making the lineage and recommendation easy to find.

## Alternatives Considered

### Minimal Link Only

Add Goblin only to the README `Links` section and the homepage footer.

This has the lowest maintenance cost, but it does not read as a recommendation and users may miss the origin story.

### Full Promotion Section

Add a larger homepage feature section with image treatment, multiple buttons, and stronger copy.

This is more visible, but it competes with Hobgoblin's own product narrative. It is more than the request needs.

## README Design

Update all four README files with matching structure:

- English: `## Origins`
- Simplified Chinese: `## 起源`
- Korean: `## 기원`
- Japanese: `## 起源`

Place the section after the productivity formula paragraph and before the product features list.

The section should say:

- Goblin is the origin of Hobgoblin.
- Goblin is a small, focused project for Git branches and worktrees.
- Hobgoblin extends that idea into a broader workspace with AI CLI sessions, multiple terminals, server mode, and richer repository workflows.
- The link target is `https://nano-props.github.io/goblin/`.

The README copy should stay short: one paragraph plus one link is enough. No screenshots or extra assets are required.

## GitHub Pages Design

Update `docs/index.html` only.

Add a new section after `#features` and before `#install`:

- Section label: `Origin`
- Title: short copy that names Goblin as the starting point.
- Description: one paragraph explaining the relationship.
- Primary link: `Visit Goblin`, pointing to `https://nano-props.github.io/goblin/`.
- Secondary link: `Goblin source`, pointing to `https://github.com/nano-props/goblin`.

The section should reuse existing layout primitives and CSS variables:

- No framework.
- No build step.
- No new image assets.
- No external runtime dependencies.
- No nested card patterns.

If a new CSS class is useful, keep it small and scoped to this section. The visual weight should be between normal body copy and the feature cards: visible, but not dominant.

## Localization

This change must be fully multilingual, not English-only or Chinese-only.

The README change must update all existing README locales:

- `README.md`
- `README.zh-CN.md`
- `README.ko.md`
- `README.ja.md`

The Pages homepage must add `i18n` entries for every existing homepage locale:

- English
- Simplified Chinese
- Korean
- Japanese

No locale should rely on another language's fallback copy for the new origin recommendation.

The nav does not need a new item. The origin section is a recommendation, not a primary navigation destination.

README translations should preserve meaning instead of being literal. The Simplified Chinese copy should use the user's phrasing "小而美" naturally.

## Data Flow

There is no application data flow.

The homepage language switcher already maps `data-i18n` and `data-i18n-html` attributes to the inline dictionary. The new section should use the same mechanism.

## Error Handling

This is static documentation. No runtime error handling is required.

Links must use `target="_blank"` and `rel="noopener noreferrer"` to match existing external-link behavior.

## Verification

Docs-only verification:

- Inspect all four README files and confirm the origin section exists in the same location.
- Inspect `docs/index.html` and confirm the new section appears after features and before install.
- Confirm all new Pages text keys exist in all four language dictionaries.
- Open `docs/index.html` locally and switch languages to verify the section updates.
- Confirm links point to:
  - `https://nano-props.github.io/goblin/`
  - `https://github.com/nano-props/goblin`

No source-level tests are required unless implementation touches application source.

## Scope Boundaries

In scope:

- README origin sections.
- Pages origin recommendation section.
- Localized copy for the existing supported languages.
- Matching multilingual coverage across README files and the Pages homepage.

Out of scope:

- Changing application behavior.
- Adding new assets.
- Changing GitHub Pages deployment.
- Renaming internal Hobgoblin or Goblin files.
- Adding a new documentation framework.
- Creating a git commit unless the user explicitly requests it.

## Acceptance Criteria

- `README.md`, `README.zh-CN.md`, `README.ko.md`, and `README.ja.md` each mention Goblin as Hobgoblin's origin.
- Each README includes a link to `https://nano-props.github.io/goblin/`.
- `docs/index.html` includes a visible origin recommendation section after features and before install.
- The Pages origin section is localized for English, Simplified Chinese, Korean, and Japanese.
- No new origin recommendation text is left untranslated in the existing public documentation locales.
- The Pages origin section links to Goblin's homepage and source repository.
- The change remains docs-only and introduces no new dependency.
