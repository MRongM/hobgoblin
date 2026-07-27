#!/usr/bin/env bash

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command_name" >&2
        return 1
    fi
}

profile_density() {
    local profile="$1"
    case "$profile" in
        phone)
            printf '420\n'
            ;;
        tablet-7)
            printf '288\n'
            ;;
        tablet-10)
            printf '216\n'
            ;;
        *)
            printf 'Unsupported screenshot profile: %s\n' "$profile" >&2
            return 1
            ;;
    esac
}

image_property() {
    local path="$1"
    local property="$2"

    sips -g "$property" "$path" 2>/dev/null \
        | awk -v key="$property:" '$1 == key { print $2; exit }'
}

file_size_bytes() {
    stat -f '%z' "$1"
}

normalize_screenshot() {
    local input="$1"
    local output="$2"

    require_command ffmpeg
    require_command sips
    [[ -s "$input" ]] || {
        printf 'Screenshot input is missing: %s\n' "$input" >&2
        return 1
    }

    local width
    local height
    width="$(image_property "$input" pixelWidth)"
    height="$(image_property "$input" pixelHeight)"
    if [[ "$width" != "1080" || "$height" != "1920" ]]; then
        printf 'Screenshot must be captured at 1080x1920, got %sx%s: %s\n' \
            "$width" "$height" "$input" >&2
        return 1
    fi

    mkdir -p "$(dirname "$output")"
    ffmpeg -hide_banner -loglevel error -y -i "$input" \
        -map_metadata -1 -frames:v 1 -vf "format=rgb24" "$output"
}

redact_host_label() {
    local input="$1"
    local output="$2"
    local profile="$3"
    local geometry

    case "$profile" in
        phone)
            geometry="500:90:155:140"
            ;;
        tablet-7)
            geometry="360:70:100:125"
            ;;
        tablet-10)
            geometry="280:60:70:120"
            ;;
        *)
            printf 'Unsupported screenshot profile: %s\n' "$profile" >&2
            return 1
            ;;
    esac

    require_command ffmpeg
    [[ -s "$input" ]] || {
        printf 'Screenshot input is missing: %s\n' "$input" >&2
        return 1
    }

    local width
    local height
    local crop_width
    local crop_height
    local crop_x
    local crop_y
    width="$(image_property "$input" pixelWidth)"
    height="$(image_property "$input" pixelHeight)"
    if [[ "$width" != "1080" || "$height" != "1920" ]]; then
        printf 'Screenshot must be captured at 1080x1920, got %sx%s: %s\n' \
            "$width" "$height" "$input" >&2
        return 1
    fi

    IFS=: read -r crop_width crop_height crop_x crop_y <<<"$geometry"
    mkdir -p "$(dirname "$output")"
    ffmpeg -hide_banner -loglevel error -y -i "$input" \
        -map_metadata -1 -frames:v 1 \
        -filter_complex \
        "[0:v]split=2[base][region];[region]crop=$crop_width:$crop_height:$crop_x:$crop_y,boxblur=12:3[blur];[base][blur]overlay=$crop_x:$crop_y,format=rgb24" \
        "$output"
}

validate_png() {
    local path="$1"
    local expected_width="$2"
    local expected_height="$3"
    local max_bytes="$4"
    local alpha_policy="$5"

    require_command sips
    [[ -s "$path" ]] || {
        printf 'PNG is missing or empty: %s\n' "$path" >&2
        return 1
    }

    local format
    local width
    local height
    local has_alpha
    local bytes
    format="$(image_property "$path" format)"
    width="$(image_property "$path" pixelWidth)"
    height="$(image_property "$path" pixelHeight)"
    has_alpha="$(image_property "$path" hasAlpha)"
    bytes="$(file_size_bytes "$path")"

    [[ "$format" == "png" ]] || {
        printf 'Expected PNG format, got %s: %s\n' "$format" "$path" >&2
        return 1
    }
    if [[ "$width" != "$expected_width" || "$height" != "$expected_height" ]]; then
        printf 'Expected %sx%s, got %sx%s: %s\n' \
            "$expected_width" "$expected_height" "$width" "$height" "$path" >&2
        return 1
    fi
    if (( bytes > max_bytes )); then
        printf 'PNG exceeds %s bytes (%s): %s\n' "$max_bytes" "$bytes" "$path" >&2
        return 1
    fi

    case "$alpha_policy" in
        required)
            [[ "$has_alpha" == "yes" ]] || {
                printf 'PNG requires an alpha channel: %s\n' "$path" >&2
                return 1
            }
            ;;
        forbidden)
            [[ "$has_alpha" == "no" ]] || {
                printf 'PNG must not contain an alpha channel: %s\n' "$path" >&2
                return 1
            }
            ;;
        any)
            ;;
        *)
            printf 'Unsupported alpha policy: %s\n' "$alpha_policy" >&2
            return 1
            ;;
    esac
}

image_manifest_row() {
    local group="$1"
    local path="$2"
    local display_path="${3:-$path}"
    local width
    local height
    local has_alpha
    local bytes
    local checksum

    width="$(image_property "$path" pixelWidth)"
    height="$(image_property "$path" pixelHeight)"
    has_alpha="$(image_property "$path" hasAlpha)"
    bytes="$(file_size_bytes "$path")"
    checksum="$(shasum -a 256 "$path" | awk '{ print $1 }')"

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$group" "$display_path" "$width" "$height" "$has_alpha" "$bytes" "$checksum"
}
