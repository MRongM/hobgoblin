#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/build-windows-from-wsl.sh [options]

Build the primary Windows desktop app from WSL with the Windows-native
Bun, Node.js, and Electron Builder toolchain.

Options:
  --dir             Build release/win-unpacked (default and fastest).
  --installer       Build an NSIS installer.
  --install         Build the installer and install it silently.
  --arch ARCH       Build x64 or arm64 (default: x64).
  --proxy PROXY     Use a proxy URL or a localhost port such as 7890.
  --typecheck       Run the full typecheck before packaging.
  --clean           Remove only the root release/ output before building.
  -h, --help        Show this help.
EOF
}

target='dir'
arch='x64'
run_typecheck=0
clean_output=0
build_proxy=''
install_after_build=0

while (($# > 0)); do
  case "$1" in
    --dir)
      target='dir'
      ;;
    --installer)
      target='nsis'
      ;;
    --install)
      target='nsis'
      install_after_build=1
      ;;
    --arch)
      if (($# < 2)); then
        echo 'Error: --arch requires x64 or arm64.' >&2
        exit 2
      fi
      arch="$2"
      shift
      ;;
    --proxy)
      if (($# < 2)); then
        echo 'Error: --proxy requires a URL or port.' >&2
        exit 2
      fi
      build_proxy="$2"
      shift
      ;;
    --typecheck)
      run_typecheck=1
      ;;
    --clean)
      clean_output=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$build_proxy" =~ ^[0-9]+$ ]]; then
  windows_host="$(ip route show default 2>/dev/null | awk '{ print $3; exit }')"
  windows_host="${windows_host:-127.0.0.1}"
  build_proxy="http://$windows_host:$build_proxy"
fi
if [[ -n "$build_proxy" && ! "$build_proxy" =~ ^https?:// ]]; then
  echo 'Error: --proxy must be an HTTP(S) URL or a localhost port.' >&2
  exit 2
fi
if [[ -n "$build_proxy" ]]; then
  export HTTP_PROXY="$build_proxy"
  export HTTPS_PROXY="$build_proxy"
  export http_proxy="$build_proxy"
  export https_proxy="$build_proxy"
fi

if [[ "$arch" != 'x64' && "$arch" != 'arm64' ]]; then
  echo "Error: unsupported architecture: $arch" >&2
  exit 2
fi

if [[ ! -r /proc/sys/kernel/osrelease ]] || ! grep -qi microsoft /proc/sys/kernel/osrelease; then
  echo 'Error: this script must run inside WSL.' >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "$repo_root" in
  /mnt/[a-zA-Z]/*) ;;
  *)
    echo 'Error: keep the repository on a Windows-mounted drive such as /mnt/c so Windows tools can package it.' >&2
    exit 1
    ;;
esac
cd "$repo_root"

bun_windows="$(command -v bun.exe || true)"
node_windows="$(command -v node.exe || true)"
if [[ -z "$bun_windows" ]]; then
  echo 'Error: bun.exe is not visible from WSL. Install Bun on Windows and ensure Windows interop PATH is enabled.' >&2
  exit 1
fi
if [[ -z "$node_windows" ]]; then
  echo 'Error: node.exe is not visible from WSL. Install Node.js on Windows and ensure Windows interop PATH is enabled.' >&2
  exit 1
fi
if [[ ! -d node_modules || ! -f node_modules/electron-builder/cli.js ]]; then
  echo 'Error: root dependencies are missing. Run bun.exe install from this repository first.' >&2
  exit 1
fi

repo_root_windows="$(wslpath -w "$repo_root")"
export HOBGOBLIN_WSL_BUILD_ROOT="$repo_root_windows"
electron_cache_directory="$repo_root/tmp/electron-cache"
mkdir -p "$electron_cache_directory"
export ELECTRON_CACHE="$(wslpath -w "$electron_cache_directory")"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

add_windows_environment() {
  local variable_name="$1"
  case ":${WSLENV:-}:" in
    *":$variable_name:"*) ;;
    *) WSLENV="${WSLENV:+$WSLENV:}$variable_name" ;;
  esac
  export WSLENV
}

add_windows_environment HOBGOBLIN_WSL_BUILD_ROOT
add_windows_environment ELECTRON_CACHE
add_windows_environment ELECTRON_MIRROR
for proxy_variable in HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy; do
  if [[ -n "${!proxy_variable:-}" ]]; then
    add_windows_environment "$proxy_variable"
  fi
done

for required_command in curl sha256sum awk; do
  if ! command -v "$required_command" >/dev/null; then
    echo "Error: required WSL command is missing: $required_command" >&2
    exit 1
  fi
done

electron_version="$("$node_windows" -p 'require("./package.json").devDependencies.electron')"
electron_version="${electron_version//$'\r'/}"
electron_version="${electron_version#\^}"
electron_version="${electron_version#\~}"
electron_archive_name="electron-v$electron_version-win32-$arch.zip"
electron_archive="$electron_cache_directory/$electron_archive_name"
electron_partial_archive="$electron_archive.partial"
electron_mirror="${ELECTRON_MIRROR%/}"
electron_version_root="$electron_mirror/v$electron_version"
expected_electron_sha="$({
  curl --fail --silent --show-error --location "$electron_version_root/SHASUMS256.txt"
} | awk -v archive="$electron_archive_name" '$2 == "*" archive || $2 == archive { print $1; exit }')"
if [[ ! "$expected_electron_sha" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Error: could not resolve the Electron checksum for $electron_archive_name." >&2
  exit 1
fi

electron_cache_ready=0
if [[ -f "$electron_archive" ]]; then
  actual_electron_sha="$(sha256sum "$electron_archive" | awk '{ print $1 }')"
  if [[ "$actual_electron_sha" == "$expected_electron_sha" ]]; then
    electron_cache_ready=1
  else
    rm -f -- "$electron_archive"
  fi
fi
if ((electron_cache_ready == 0)) && [[ -f "$electron_partial_archive" ]]; then
  actual_electron_sha="$(sha256sum "$electron_partial_archive" | awk '{ print $1 }')"
  if [[ "$actual_electron_sha" == "$expected_electron_sha" ]]; then
    mv -f -- "$electron_partial_archive" "$electron_archive"
    electron_cache_ready=1
  fi
fi
if ((electron_cache_ready == 0)); then
  windows_local_app_data="$("$node_windows" -p 'process.env.LOCALAPPDATA || ""')"
  windows_local_app_data="${windows_local_app_data//$'\r'/}"
  if [[ -n "$windows_local_app_data" ]]; then
    system_electron_cache="$(wslpath -u "$windows_local_app_data")/electron/Cache"
    while IFS= read -r candidate_archive; do
      actual_electron_sha="$(sha256sum "$candidate_archive" | awk '{ print $1 }')"
      if [[ "$actual_electron_sha" == "$expected_electron_sha" ]]; then
        cp -- "$candidate_archive" "$electron_archive"
        electron_cache_ready=1
        break
      fi
    done < <(find "$system_electron_cache" -type f -name "$electron_archive_name" 2>/dev/null)
  fi
fi
if ((electron_cache_ready == 0)); then
  echo "Downloading Electron $electron_version for Windows $arch..."
  curl \
    --fail \
    --location \
    --retry 3 \
    --continue-at - \
    --output "$electron_partial_archive" \
    "$electron_version_root/$electron_archive_name"
  actual_electron_sha="$(sha256sum "$electron_partial_archive" | awk '{ print $1 }')"
  if [[ "$actual_electron_sha" != "$expected_electron_sha" ]]; then
    rm -f -- "$electron_partial_archive"
    echo "Error: Electron checksum mismatch for $electron_archive_name." >&2
    exit 1
  fi
  mv -f -- "$electron_partial_archive" "$electron_archive"
else
  echo "Using cached Electron archive: $electron_archive"
fi

active_vitest_count="$({
  powershell.exe -NoProfile -Command '
    $root = $env:HOBGOBLIN_WSL_BUILD_ROOT.ToLowerInvariant()
    @(
      Get-CimInstance Win32_Process |
        Where-Object {
          $_.Name -in @("node.exe", "bun.exe") -and
          $_.CommandLine -like "*vitest*" -and
          $_.CommandLine.ToLowerInvariant().Contains($root)
        }
    ).Count
  '
} | tr -d '\r[:space:]')"
if [[ "$active_vitest_count" =~ ^[1-9][0-9]*$ ]]; then
  echo 'Error: a Vitest process is still running for this repository. Stop the test/watch process before packaging.' >&2
  exit 1
fi

release_dir="$repo_root/release"
if ((clean_output == 1)); then
  if [[ "$(dirname "$release_dir")" != "$repo_root" || "$(basename "$release_dir")" != 'release' ]]; then
    echo 'Error: refused to clean an unexpected output path.' >&2
    exit 1
  fi
  rm -rf -- "$release_dir"
fi

if ((run_typecheck == 1)); then
  "$bun_windows" run typecheck
fi

"$bun_windows" run build:web

arch_flag="--$arch"
"$node_windows" node_modules/electron-builder/cli.js \
  --win "$target" \
  "$arch_flag" \
  --publish never \
  --config.npmRebuild=false

if [[ "$target" == 'dir' ]]; then
  unpacked_directory='win-unpacked'
  if [[ "$arch" == 'arm64' ]]; then
    unpacked_directory='win-arm64-unpacked'
  fi
  artifact="$release_dir/$unpacked_directory/Hobgoblin.exe"
else
  version="$("$node_windows" -p 'require("./package.json").version')"
  version="${version//$'\r'/}"
  artifact="$release_dir/Hobgoblin-$version-$arch.exe"
fi

if [[ ! -f "$artifact" ]]; then
  echo "Error: expected Windows artifact is missing: $artifact" >&2
  exit 1
fi

echo "Built Windows artifact: $artifact"

if ((install_after_build == 1)); then
  export HOBGOBLIN_WINDOWS_UPDATE_HELPER="$(wslpath -w "$repo_root/scripts/install-windows-build.ps1")"
  export HOBGOBLIN_WINDOWS_UPDATE_INSTALLER="$(wslpath -w "$artifact")"
  export HOBGOBLIN_WINDOWS_UPDATE_LOG="$(wslpath -w "$repo_root/tmp/auto-update.log")"
  HOBGOBLIN_WINDOWS_INSTALLED_APP="$({
    powershell.exe -NoProfile -NonInteractive -Command '
      $running = Get-Process -Name Hobgoblin -ErrorAction SilentlyContinue |
        Where-Object { $_.Path } |
        Select-Object -First 1 -ExpandProperty Path
      if ($running) {
        $running
      } else {
        Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Programs\Hobgoblin\Hobgoblin.exe"
      }
    '
  } | tr -d '\r')"
  export HOBGOBLIN_WINDOWS_INSTALLED_APP
  for update_variable in \
    HOBGOBLIN_WINDOWS_UPDATE_HELPER \
    HOBGOBLIN_WINDOWS_UPDATE_INSTALLER \
    HOBGOBLIN_WINDOWS_UPDATE_LOG \
    HOBGOBLIN_WINDOWS_INSTALLED_APP; do
    add_windows_environment "$update_variable"
  done

  updater_pid="$({
    powershell.exe -NoProfile -NonInteractive -Command '
      $arguments = @(
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$env:HOBGOBLIN_WINDOWS_UPDATE_HELPER`"",
        "-InstallerPath", "`"$env:HOBGOBLIN_WINDOWS_UPDATE_INSTALLER`"",
        "-InstalledAppPath", "`"$env:HOBGOBLIN_WINDOWS_INSTALLED_APP`"",
        "-LogPath", "`"$env:HOBGOBLIN_WINDOWS_UPDATE_LOG`""
      )
      $updater = Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList $arguments -PassThru
      $updater.Id
    '
  } | tr -d '\r[:space:]')"
  echo "Scheduled Windows app installation (updater PID: $updater_pid)."
fi
