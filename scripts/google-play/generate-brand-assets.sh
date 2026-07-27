#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ASSET_ROOT="${1:-$REPO_ROOT/release/google-play/0.1.0/graphics}"
ICON_SOURCE="$REPO_ROOT/assets/icon.png"
FEATURE_SOURCE="$ASSET_ROOT/feature-graphic.svg"

source "$SCRIPT_DIR/release-assets-lib.sh"

require_command ffmpeg
require_command sips
require_command bun
mkdir -p "$ASSET_ROOT"

ICON_OUTPUT="$ASSET_ROOT/app-icon.png"
FEATURE_OUTPUT="$ASSET_ROOT/feature-graphic.png"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hobgoblin-brand-assets.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT INT TERM

[[ -s "$ICON_SOURCE" ]] || {
    printf 'Canonical icon is missing: %s\n' "$ICON_SOURCE" >&2
    exit 1
}
[[ -s "$FEATURE_SOURCE" ]] || {
    printf 'Feature graphic source is missing: %s\n' "$FEATURE_SOURCE" >&2
    exit 1
}

sips -z 512 512 "$ICON_SOURCE" --out "$ICON_OUTPUT" >/dev/null
bun "$SCRIPT_DIR/render-svg.ts" "$FEATURE_SOURCE" "$TEMP_ROOT/feature.png" 1024 500
ffmpeg -hide_banner -loglevel error -y -i "$TEMP_ROOT/feature.png" \
    -map_metadata -1 -frames:v 1 -vf "format=rgb24" "$FEATURE_OUTPUT"

validate_png "$ICON_OUTPUT" 512 512 1048576 required
validate_png "$FEATURE_OUTPUT" 1024 500 15728640 forbidden

printf 'Generated Google Play icon: %s\n' "$ICON_OUTPUT"
printf 'Generated Google Play feature graphic: %s\n' "$FEATURE_OUTPUT"
