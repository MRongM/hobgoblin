# Android App Logo Design

## Goal

Use the existing Hobgoblin brand artwork under `assets/` as the Android launcher icon, replacing the generic green terminal icon without changing the product identity or adding dependencies.

## Chosen Direction

- Treat `assets/hobgoblin-icon.svg` as the canonical source.
- Preserve the full-bleed dark terminal background, white prompt, gray baseline, and blue-to-green branch mark.
- Use an Android adaptive icon because the application requires API 26 or newer.
- Keep the foreground mark comfortably inside the adaptive-icon safe zone so circular, rounded-square, and vendor masks do not clip the branch nodes. The Android-only outer scale is `0.50`, with a `(-4, -8)` visual-centering offset; the canonical asset proportions remain unchanged.
- Configure both the normal launcher icon and the round launcher icon.

## Resource Structure

- `drawable/ic_launcher_background.xml`: dark terminal gradient adapted from the SVG.
- `drawable/ic_launcher_foreground.xml`: transparent vector foreground adapted from the SVG paths and colors.
- `mipmap-anydpi-v26/ic_launcher.xml`: standard adaptive icon composition.
- `mipmap-anydpi-v26/ic_launcher_round.xml`: round adaptive icon composition using the same brand layers.
- `AndroidManifest.xml`: references the mipmap launcher resources and declares the round icon.

The existing `drawable/ic_launcher.xml` remains available to the foreground-service notification, whose small-icon rendering contract is separate from launcher icons.

## Verification

- Add a JVM contract test that checks the manifest references and adaptive-icon layer wiring.
- Run the focused Android contract test.
- Run the full Android unit-test suite.
- Assemble the debug APK to validate AAPT resource compilation.
- Do not run TypeScript, Vitest, or architecture gates for this Android-only change.

## Out of Scope

- No AI redraw or logo redesign.
- No package, app label, notification behavior, or desktop asset changes.
- No new libraries or build plugins.
- No Git commit or push.
