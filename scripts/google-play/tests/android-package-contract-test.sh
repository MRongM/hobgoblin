#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
android_root="$repo_root/android"
expected_package="com.mrongm.hobgoblin"
legacy_package="dev.hobgoblin.android"
legacy_path="dev/hobgoblin/android"

rg -q "namespace = \"$expected_package\"" "$android_root/app/build.gradle.kts"
rg -q "applicationId = \"$expected_package\"" "$android_root/app/build.gradle.kts"

test -d "$android_root/app/src/main/java/com/mrongm/hobgoblin"
test -d "$android_root/app/src/test/java/com/mrongm/hobgoblin"
test ! -e "$android_root/app/src/main/java/dev/hobgoblin/android"
test ! -e "$android_root/app/src/test/java/dev/hobgoblin/android"

if rg -n -F "$legacy_package" \
    "$android_root/app/src/main" \
    "$android_root/app/src/test" \
    "$android_root/app/build.gradle.kts"; then
    echo "Legacy Android package references remain." >&2
    exit 1
fi

if rg -n -F "$legacy_path" "$android_root/app/src/main" "$android_root/app/src/test"; then
    echo "Legacy Android source paths remain." >&2
    exit 1
fi

echo "android-package-contract-test: PASS"
