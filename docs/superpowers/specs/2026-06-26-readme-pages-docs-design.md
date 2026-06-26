# README and GitHub Pages Documentation Design

## Intent

Improve Hobgoblin's public-facing documentation across the languages already supported by the project website: English, Simplified Chinese, Korean, and Japanese.

The documentation should make the product understandable from the repository homepage and from GitHub Pages without requiring readers to inspect source files. Each language should cover:

- Product description
- Product features
- Installation steps
- Development run steps

The GitHub Pages site should be published automatically from the repository's `docs/` directory.

## Current Context

The repository currently has:

- A short English-only `README.md`.
- A static multilingual product page at `docs/index.html`.
- A release workflow at `.github/workflows/release.yml`.
- No GitHub Pages deployment workflow.
- Release artifacts generated for macOS arm64, macOS x64, and Windows x64.

The existing `docs/index.html` already supports English, Simplified Chinese, Korean, and Japanese via an inline language dictionary. It covers product positioning and features, but its installation guidance is limited to download links.

## Scope

In scope:

- Expand `README.md` as the English source-facing README.
- Add independent localized README files:
  - `README.zh-CN.md`
  - `README.ko.md`
  - `README.ja.md`
- Add language links between all README files.
- Ensure every README includes product description, product features, installation steps, development run steps, and useful project links.
- Extend `docs/index.html` with an installation section and corresponding navigation entry.
- Add translations for the new GitHub Pages installation section in English, Simplified Chinese, Korean, and Japanese.
- Add a GitHub Pages workflow that deploys `docs/` as a static site.

Out of scope:

- Changing application behavior.
- Changing release artifact generation.
- Adding a static site generator or documentation framework.
- Adding screenshots or image-generation work.
- Renaming internal `goblin` namespaces.
- Creating commits unless explicitly requested by the user.

## Selected Approach

Use independent language-specific README files plus the existing static GitHub Pages site.

Rejected alternatives:

- A single README containing all languages: fewer files, but too long and weaker for GitHub reading.
- A website-first documentation model with a minimal README: extensible, but it weakens the repository homepage and does not match the requested language-specific README files.

The selected approach keeps the change simple and explicit. It avoids a documentation build chain while keeping future localization updates isolated by file.

## README Structure

Each README should follow the same section order:

1. Language switcher
2. Product description
3. Product features
4. Installation
5. Development
6. GitHub Pages / release links
7. License note

The English `README.md` remains the repository default. Localized files should be complete documents rather than partial translations so that a reader can stay in one language.

Installation guidance should cover:

- Downloading the latest GitHub Release.
- macOS Apple Silicon: use the `arm64.dmg` artifact.
- macOS Intel: use the `x64.dmg` artifact.
- Windows x64: use the `.exe` artifact.
- Unsigned build caveats:
  - macOS Gatekeeper may require opening from context menu or clearing quarantine.
  - Windows SmartScreen may warn on unsigned installers.
- Development run:

```sh
bun install
bun run dev
```

Build/install guidance may include the existing macOS local installer path:

```sh
bun run install:app
```

The README should not promise package-manager installation, code signing, automatic updates, or Linux builds.

## GitHub Pages Structure

Keep `docs/index.html` as a single static page.

Add:

- An `Install` navigation link.
- A new installation section between features/how-it-works and the CTA.
- Four localized installation copy sets in the existing inline `i18n` dictionary.
- Release/download links pointing to the repository's GitHub Releases page.

The new section should fit the current page architecture:

- No new framework.
- No build step.
- No separate JavaScript bundle.
- No network-dependent assets.
- Reuse the existing style system, language toggle, theme toggle, and `goblin.png` asset.

The content should explain the release artifacts in terms a user can choose from:

- macOS Apple Silicon
- macOS Intel
- Windows x64
- Development from source

## GitHub Pages Workflow

Add `.github/workflows/pages.yml`.

Trigger:

- `workflow_dispatch`
- `push` to the default branch when `docs/**` or the Pages workflow changes

Permissions:

- Global `contents: read`
- Deploy job:
  - `pages: write`
  - `id-token: write`

Implementation:

- Check out the repository.
- Configure GitHub Pages with `actions/configure-pages@v5`.
- Upload `docs/` with `actions/upload-pages-artifact@v4`.
- Deploy with `actions/deploy-pages@v4`.
- Use the `github-pages` environment and expose the deployed URL from the deployment step.

This follows GitHub's current custom workflow guidance for Pages deployments.

## Error Handling

Documentation pages have no runtime error flow.

The Pages workflow should fail clearly if:

- `docs/` is missing.
- GitHub Pages is not enabled for workflow deployment in the repository settings.
- GitHub Actions permissions do not allow Pages deployment.

No custom recovery automation is required. The workflow logs are sufficient for this static-site deployment.

## Verification

After implementation:

```sh
bun run format:check
```

For a docs-only change, `bun run typecheck`, `bun run check:architecture`, and `bun run test` are not required unless source files or workflow-adjacent scripts are touched.

Manual checks:

- Open `README.md` and each localized README in a Markdown preview or plain text and confirm the required sections exist.
- Open `docs/index.html` locally and verify:
  - The new navigation item scrolls to the installation section.
  - Language switching updates installation copy.
  - The layout remains readable on desktop and mobile widths.
  - Download links point to GitHub Releases.
- Review `.github/workflows/pages.yml` against GitHub Pages workflow requirements.

## Risks

- Localized README files can drift over time. Matching section order and language switchers reduce maintenance cost.
- Release artifact names may change in the future. The docs should describe platform choices and link to Releases rather than hard-code a specific version.
- GitHub Pages publishing requires repository settings to allow GitHub Actions as the Pages source. The workflow can be correct while the first deployment still needs repository-level setup.
- Unsigned installers can alarm users. README and Pages copy must state the signing caveat without overstating safety.

## Acceptance Criteria

- `README.md`, `README.zh-CN.md`, `README.ko.md`, and `README.ja.md` exist and cross-link.
- Each README includes product description, product features, installation steps, development run steps, and relevant links.
- `docs/index.html` includes an installation section in all four supported languages.
- GitHub Pages can be deployed from `docs/` through a dedicated workflow.
- No application source behavior changes are introduced.
- No new dependencies are added.
- No git commit is created unless explicitly requested.
