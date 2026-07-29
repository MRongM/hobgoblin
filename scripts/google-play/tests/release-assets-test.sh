#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../release-assets-lib.sh"

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    [[ "$actual" == "$expected" ]] || fail "expected '$expected', got '$actual'"
}

assert_eq "420" "$(profile_density phone)"
assert_eq "288" "$(profile_density tablet-7)"
assert_eq "216" "$(profile_density tablet-10)"

if profile_density unsupported >/dev/null 2>&1; then
    fail "unsupported profile unexpectedly passed"
fi

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hobgoblin-release-assets-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT INT TERM

RGBA_FIXTURE="$TEST_ROOT/rgba.png"
NORMALIZED_FIXTURE="$TEST_ROOT/normalized.png"
SVG_FIXTURE="$TEST_ROOT/fixture.svg"
RENDERED_FIXTURE="$TEST_ROOT/rendered.png"
REDACTED_PHONE_FIXTURE="$TEST_ROOT/redacted-phone.png"
REDACTED_TABLET_7_FIXTURE="$TEST_ROOT/redacted-tablet-7.png"
REDACTED_TABLET_10_FIXTURE="$TEST_ROOT/redacted-tablet-10.png"

ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=0x38bdf8@1.0:s=1080x1920:d=0.1" \
    -frames:v 1 -vf "format=rgba" "$RGBA_FIXTURE"

normalize_screenshot "$RGBA_FIXTURE" "$NORMALIZED_FIXTURE"
redact_host_label "$RGBA_FIXTURE" "$REDACTED_PHONE_FIXTURE" phone
redact_host_label "$RGBA_FIXTURE" "$REDACTED_TABLET_7_FIXTURE" tablet-7
redact_host_label "$RGBA_FIXTURE" "$REDACTED_TABLET_10_FIXTURE" tablet-10
validate_png "$RGBA_FIXTURE" 1080 1920 8388608 required
validate_png "$NORMALIZED_FIXTURE" 1080 1920 8388608 forbidden
validate_png "$REDACTED_PHONE_FIXTURE" 1080 1920 8388608 forbidden
validate_png "$REDACTED_TABLET_7_FIXTURE" 1080 1920 8388608 forbidden
validate_png "$REDACTED_TABLET_10_FIXTURE" 1080 1920 8388608 forbidden

if validate_png "$NORMALIZED_FIXTURE" 1080 2160 8388608 forbidden >/dev/null 2>&1; then
    fail "dimension mismatch unexpectedly passed"
fi

if validate_png "$RGBA_FIXTURE" 1080 1920 8388608 forbidden >/dev/null 2>&1; then
    fail "alpha channel unexpectedly passed forbidden policy"
fi

MANIFEST_ROW="$(image_manifest_row phone "$NORMALIZED_FIXTURE" phone/fixture.png)"
assert_eq "7" "$(awk -F '\t' '{ print NF }' <<<"$MANIFEST_ROW")"
assert_eq "phone" "$(awk -F '\t' '{ print $1 }' <<<"$MANIFEST_ROW")"
assert_eq "phone/fixture.png" "$(awk -F '\t' '{ print $2 }' <<<"$MANIFEST_ROW")"
assert_eq "1080" "$(awk -F '\t' '{ print $3 }' <<<"$MANIFEST_ROW")"
assert_eq "1920" "$(awk -F '\t' '{ print $4 }' <<<"$MANIFEST_ROW")"
assert_eq "no" "$(awk -F '\t' '{ print $5 }' <<<"$MANIFEST_ROW")"

printf '%s\n' \
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">' \
    '<rect width="1024" height="500" fill="#020617" />' \
    '</svg>' > "$SVG_FIXTURE"
bun "$SCRIPT_DIR/../render-svg.ts" "$SVG_FIXTURE" "$RENDERED_FIXTURE" 1024 500
validate_png "$RENDERED_FIXTURE" 1024 500 15728640 required

printf 'release-assets-test: PASS\n'
