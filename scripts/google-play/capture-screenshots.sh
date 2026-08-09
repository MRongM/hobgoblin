#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/release-assets-lib.sh"

PACKAGE_VERSION="$(package_version "$REPO_ROOT/package.json")"
ASSET_ROOT="${HOBGOBLIN_PLAY_ASSET_ROOT:-$REPO_ROOT/release/google-play/$PACKAGE_VERSION/graphics}"
PACKAGE_NAME="com.mrongm.hobgoblin"

usage() {
    printf '%s\n' \
        'Usage:' \
        '  capture-screenshots.sh prepare <phone|tablet-7|tablet-10>' \
        '  capture-screenshots.sh capture <profile> <01-settings.png|02-projects.png|03-worktrees.png|04-terminal.png|05-terminals.png>' \
        '  capture-screenshots.sh reset'
}

require_adb_device() {
    require_command adb
    if [[ "$(adb get-state 2>/dev/null || true)" != "device" ]]; then
        printf 'No ready Android device or emulator is connected.\n' >&2
        return 1
    fi
}

prepare_profile() {
    local profile="$1"
    local density
    density="$(profile_density "$profile")"

    require_adb_device
    adb shell wm size 1080x1920 >/dev/null
    adb shell wm density "$density" >/dev/null
    adb shell am force-stop "$PACKAGE_NAME"
    adb shell am start -n "$PACKAGE_NAME/.MainActivity" >/dev/null
    printf 'Prepared %s at 1080x1920, %s dpi. Navigate to the required privacy-safe UI state.\n' \
        "$profile" "$density"
}

capture_screenshot() {
    local profile="$1"
    local file_name="$2"
    local device_path="/sdcard/Download/hobgoblin-play-$file_name"
    local raw_file
    local output_file="$ASSET_ROOT/$profile/$file_name"

    profile_density "$profile" >/dev/null
    case "$file_name" in
        01-settings.png|02-projects.png|03-worktrees.png|04-terminal.png|05-terminals.png)
            ;;
        *)
            printf 'Unsupported screenshot file: %s\n' "$file_name" >&2
            return 1
            ;;
    esac

    require_adb_device
    raw_file="$(mktemp "${TMPDIR:-/tmp}/hobgoblin-play-screenshot.XXXXXX.png")"
    trap 'rm -f "$raw_file"' RETURN
    adb shell screencap -p "$device_path"
    adb pull "$device_path" "$raw_file" >/dev/null
    adb shell rm -f "$device_path"

    if [[ "$file_name" == "03-worktrees.png" ]]; then
        redact_host_label "$raw_file" "$output_file" "$profile"
    else
        normalize_screenshot "$raw_file" "$output_file"
    fi
    validate_png "$output_file" 1080 1920 8388608 forbidden
    printf 'Captured %s\n' "$output_file"
}

reset_display() {
    require_adb_device
    adb shell wm size reset >/dev/null
    adb shell wm density reset >/dev/null
    printf 'Reset emulator display size and density overrides.\n'
}

action="${1:-}"
case "$action" in
    prepare)
        [[ $# -eq 2 ]] || { usage >&2; exit 2; }
        prepare_profile "$2"
        ;;
    capture)
        [[ $# -eq 3 ]] || { usage >&2; exit 2; }
        capture_screenshot "$2" "$3"
        ;;
    reset)
        [[ $# -eq 1 ]] || { usage >&2; exit 2; }
        reset_display
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
