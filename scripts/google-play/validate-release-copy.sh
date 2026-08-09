#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/release-assets-lib.sh"

PACKAGE_VERSION="$(package_version "$REPO_ROOT/package.json")"
RELEASE_ROOT="${1:-$REPO_ROOT/release/google-play/$PACKAGE_VERSION}"
LOCALES=(en-US zh-CN ja-JP ko-KR)

fail() {
    printf 'Release copy validation failed: %s\n' "$1" >&2
    exit 1
}

text_length() {
    perl -Mopen=:std,:encoding\(UTF-8\) -0777 -e '
        my $value = <>;
        $value =~ s/\R\z//;
        print length($value);
    ' "$1"
}

validate_limit() {
    local path="$1"
    local maximum="$2"
    local length
    [[ -s "$path" ]] || fail "missing or empty $path"
    length="$(text_length "$path")"
    (( length <= maximum )) || fail "$path has $length characters; maximum is $maximum"
}

for locale in "${LOCALES[@]}"; do
    locale_root="$RELEASE_ROOT/store-listing/$locale"
    validate_limit "$locale_root/title.txt" 30
    validate_limit "$locale_root/short-description.txt" 80
    validate_limit "$locale_root/full-description.txt" 4000
    [[ -s "$locale_root/screenshot-copy.md" ]] || fail "missing screenshot copy for $locale"
    [[ -s "$RELEASE_ROOT/release-notes/$locale.txt" ]] || fail "missing release notes for $locale"

    [[ "$(tr -d '\r\n' < "$locale_root/title.txt")" == "Hobgoblin" ]] || fail "unexpected title for $locale"
done

required_docs=(README.md app-content.md data-safety.md foreground-service-declaration.md review-access.md)
for name in "${required_docs[@]}"; do
    [[ -s "$RELEASE_ROOT/$name" ]] || fail "missing $RELEASE_ROOT/$name"
done

rg -Fq 'https://mrongm.github.io/hobgoblin/privacy/' "$RELEASE_ROOT/README.md" ||
    fail "README does not contain the canonical privacy URL"
rg -Fq 'https://mrongm.github.io/hobgoblin/privacy/' "$RELEASE_ROOT/data-safety.md" ||
    fail "data safety guidance does not contain the canonical privacy URL"

if rg -qi 'TBD|TODO|\[Insert|example\.com|BEGIN (RSA |OPENSSH )?PRIVATE KEY|password[[:space:]]*[:=][[:space:]]*[^[:space:]]+' "$RELEASE_ROOT"; then
    fail "release copy contains unfinished or secret-looking content"
fi

printf 'Validated Google Play copy for 4 locales.\n'
