#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/release-assets-lib.sh"

PACKAGE_VERSION="$(package_version "$REPO_ROOT/package.json")"
ASSET_ROOT="${1:-$REPO_ROOT/release/google-play/$PACKAGE_VERSION/graphics}"

validate_png "$ASSET_ROOT/app-icon.png" 512 512 1048576 required
validate_png "$ASSET_ROOT/feature-graphic.png" 1024 500 15728640 forbidden

profiles=(phone tablet-7 tablet-10)
screenshots=(01-settings.png 02-projects.png 03-worktrees.png 04-terminal.png 05-terminals.png)

for profile in "${profiles[@]}"; do
    for screenshot in "${screenshots[@]}"; do
        validate_png "$ASSET_ROOT/$profile/$screenshot" 1080 1920 8388608 forbidden
    done
done

manifest_temp="$(mktemp "${TMPDIR:-/tmp}/hobgoblin-asset-manifest.XXXXXX")"
trap 'rm -f "$manifest_temp"' EXIT INT TERM

printf 'group\tpath\twidth\theight\thas_alpha\tbytes\tsha256\n' > "$manifest_temp"
image_manifest_row brand "$ASSET_ROOT/app-icon.png" app-icon.png >> "$manifest_temp"
image_manifest_row brand "$ASSET_ROOT/feature-graphic.png" feature-graphic.png >> "$manifest_temp"

for profile in "${profiles[@]}"; do
    for screenshot in "${screenshots[@]}"; do
        image_manifest_row "$profile" "$ASSET_ROOT/$profile/$screenshot" \
            "$profile/$screenshot" >> "$manifest_temp"
    done
done

mv "$manifest_temp" "$ASSET_ROOT/asset-manifest.tsv"
trap - EXIT INT TERM
printf 'Validated 17 Google Play assets. Manifest: %s\n' "$ASSET_ROOT/asset-manifest.tsv"
