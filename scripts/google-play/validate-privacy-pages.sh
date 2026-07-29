#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRIVACY_ROOT="${1:-$REPO_ROOT/docs/privacy}"

fail() {
    printf 'Privacy page validation failed: %s\n' "$1" >&2
    exit 1
}

required_files=(index.html en.html zh-cn.html ja.html ko.html)
required_links=("./" zh-cn.html ja.html ko.html)

for name in "${required_files[@]}"; do
    page="$PRIVACY_ROOT/$name"
    [[ -s "$page" ]] || fail "missing $page"

    rg -q 'MRongM' "$page" || fail "$name does not identify MRongM"
    rg -q 'jiangisright@gmail\.com' "$page" || fail "$name does not include the privacy contact"
    rg -q '2026-07-27' "$page" || fail "$name does not include the effective date"
    rg -qi 'Termux' "$page" || fail "$name does not disclose Termux behavior"
    rg -qi 'retention|保留|保持|保管|보관' "$page" || fail "$name does not cover retention"
    rg -qi 'delet|删除|削除|삭제' "$page" || fail "$name does not cover deletion"

    for link in "${required_links[@]}"; do
        rg -Fq "href=\"$link\"" "$page" || fail "$name does not link to $link"
    done

    if rg -qi 'TBD|TODO|\[Insert|example\.com' "$page"; then
        fail "$name contains unfinished or example content"
    fi
done

for asset in privacy.css; do
    [[ -s "$PRIVACY_ROOT/$asset" ]] || fail "missing $PRIVACY_ROOT/$asset"
done

printf 'Validated 5 privacy pages.\n'
