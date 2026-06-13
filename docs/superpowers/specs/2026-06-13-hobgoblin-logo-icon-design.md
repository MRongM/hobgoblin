# Hobgoblin Logo And Icon Redesign

## Goal

Redesign Hobgoblin's app icon and wordmark around the approved full-bleed B1 + W1 direction: a dark terminal-first app icon with no light border outside the terminal, paired with a clean system wordmark that keeps the app chrome restrained.

## Approved Direction

- Use the B1 "Dark Terminal" icon direction with a full-bleed terminal edge.
- Make the icon read first as a terminal: dark rounded terminal surface, prominent `>` prompt, and a short terminal baseline/cursor-like stroke.
- Remove the previous light outer tile/white border; the terminal surface itself is the app icon outer shape.
- Add a small blue-to-green Git branch curve with two nodes as a secondary signal for branch/worktree identity.
- Keep the wordmark in the W1 "Clean System Wordmark" direction: plain `Hobgoblin`, system sans typography, no path prefix, prompt chip, mascot, or decorative lockup in the app topbar.
- Let the icon carry the Git + terminal concept while the wordmark stays quiet and native to the desktop app.

## Brand Structure

Hobgoblin should use a two-layer identity:

- App icon: the visual brand mark for Dock, favicon, About, docs hero, release assets, and other square icon contexts.
- Wordmark: a restrained text mark for app chrome and places where the product name must remain highly legible.

The icon and wordmark may appear side by side in docs and About contexts, but the app topbar should not add an extra icon or terminal prefix unless a later design explicitly changes the navigation layout.

## Asset Scope

- Add or update `assets/hobgoblin-icon.svg` as the maintainable source asset.
- Regenerate `assets/icon.png` for in-app and About page use.
- Regenerate `assets/icon-mac-1024.png` for Electron/macOS packaging.
- Regenerate `docs/goblin.png` for the static docs site.
- Regenerate `src/web/public/goblin.png` for the Vite renderer favicon.
- Keep current asset filenames and import paths so existing renderer, docs, and Electron entry points continue to work.
- Update `src/web/components/Logo.tsx` only as needed to align the clean wordmark style with W1; it must still render the accessible name `Hobgoblin`.

## Implementation Strategy

- Keep one source SVG and generate all PNG copies from it.
- Avoid new dependencies; use a locally available rasterization tool.
- Keep the change scoped to brand assets, the wordmark component if needed, and focused tests.
- Do not change bundle identifiers, package identity, data directories, IPC names, server routes, or product copy unrelated to the logo.
- Do not redesign the docs landing page layout.

## Verification

- Add or keep an asset contract test that verifies:
  - the source SVG has an accessible title;
  - the SVG has explicit terminal and branch semantic groups;
  - all published PNG icon assets are 1024x1024.
- Keep the Logo component test focused on accessible rendering of `Hobgoblin`, not fragile pixel details.
- Run:
  - `bun run typecheck`
  - `bun run test`
  - `bun run check:architecture` if code paths change beyond static assets.
- Visually inspect the 1024 icon and a small-size preview. At small sizes, the `>` prompt should remain readable; the Git branch may be secondary but should not become visual noise.

## Acceptance Criteria

- The icon reads first as a dark terminal window, not as a generic Git logo.
- No light tile or white border appears outside the terminal surface.
- The icon includes a `>` prompt, a terminal baseline/cursor-like stroke, and a blue-green Git branch curve with two nodes.
- The published PNG assets are synchronized and remain 1024x1024.
- The app topbar wordmark remains a clear `Hobgoblin` system-style text mark.
- About and docs contexts show the new icon and still align visually with the Hobgoblin product name.
- Existing build, packaging, and desktop identity configuration remain unchanged except for consuming the refreshed assets.

## Out Of Scope

- No internal IPC, package name, bundle identifier, or product name changes.
- No dependency additions.
- No mascot.
- No command-line-style wordmark such as `~/hobgoblin`.
- No full docs landing page redesign.
- No cleanup of historical `Goblin` mentions unless they directly reference current brand assets.
