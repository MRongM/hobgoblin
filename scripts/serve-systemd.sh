#!/usr/bin/env bash
# One-command systemd deployment for the Hobgoblin web server.
#
#   ./scripts/serve-systemd.sh            # install on first run, update afterwards
#   ./scripts/serve-systemd.sh install [--host 0.0.0.0] [--port 32200] [--data-dir DIR]
#   ./scripts/serve-systemd.sh update [--no-pull]
#   ./scripts/serve-systemd.sh status | logs | uninstall
#
# install: builds the web UI, writes /etc/systemd/system/hobgoblin.service +
#          /etc/hobgoblin/server.env (secret generated once, preserved forever),
#          then enables and starts the service.
# update:  git pull --ff-only (unless --no-pull), bun install, rebuild web UI,
#          restart the service. Never touches the env file or unit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="hobgoblin"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_DIR="/etc/hobgoblin"
ENV_FILE="${ENV_DIR}/server.env"
MIN_NODE_MAJOR=24

SUDO=""
if [[ ${EUID} -ne 0 ]]; then
  SUDO="sudo"
fi

log() { echo "[serve-systemd] $*"; }
fail() { echo "[serve-systemd] Error: $*" >&2; exit 1; }

require_node() {
  NODE_BIN="$(command -v node)" || fail "node not found in PATH (Node.js ${MIN_NODE_MAJOR}+ is required)"
  local major
  major="$("${NODE_BIN}" -p 'process.versions.node.split(".")[0]')"
  [[ ${major} -ge ${MIN_NODE_MAJOR} ]] || fail "Node.js ${MIN_NODE_MAJOR}+ required, found $("${NODE_BIN}" -v) at ${NODE_BIN}"
}

require_bun() {
  BUN_BIN="$(command -v bun)" || fail "bun not found in PATH (required to build the web UI)"
}

build() {
  cd "${REPO_ROOT}"
  log "bun install"
  "${BUN_BIN}" install
  log "building web UI (bun run build:web)"
  "${BUN_BIN}" run build:web
  [[ -f "${REPO_ROOT}/dist/web/index.html" ]] || fail "web build artifact missing: dist/web/index.html"
}

write_env_file() {
  local host="$1" port="$2" data_dir="$3"
  ${SUDO} mkdir -p "${ENV_DIR}"
  local secret
  if [[ -f "${ENV_FILE}" ]]; then
    # Preserve the existing secret so browser sessions survive reinstalls.
    secret="$(${SUDO} grep -oP '^GOBLIN_SERVER_INTERNAL_SECRET=\K.*' "${ENV_FILE}" || true)"
  fi
  if [[ -z "${secret:-}" ]]; then
    secret="$("${NODE_BIN}" -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  fi
  ${SUDO} tee "${ENV_FILE}" >/dev/null <<EOF
GOBLIN_SERVER_INTERNAL_SECRET=${secret}
GOBLIN_SERVER_HOST=${host}
GOBLIN_SERVER_PORT=${port}
${data_dir:+GOBLIN_SERVER_DATA_DIR=${data_dir}}
EOF
  ${SUDO} chmod 600 "${ENV_FILE}"
  log "env file written: ${ENV_FILE}"
}

write_unit() {
  # Bake absolute paths: systemd units don't inherit the login PATH, and node
  # here may live in a conda env. PATH is extended so shells and tools spawned
  # from Hobgoblin terminals can find node/bun/git.
  local node_dir bun_dir
  node_dir="$(dirname "${NODE_BIN}")"
  bun_dir="$(dirname "${BUN_BIN}")"
  ${SUDO} tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Hobgoblin embedded web server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=${REPO_ROOT}
EnvironmentFile=${ENV_FILE}
Environment=PATH=${node_dir}:${bun_dir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=${NODE_BIN} ${REPO_ROOT}/scripts/start-server.ts
Restart=on-failure
RestartSec=5s
KillSignal=SIGTERM
TimeoutStopSec=10s

[Install]
WantedBy=multi-user.target
EOF
  log "unit written: ${UNIT_PATH}"
}

print_urls() {
  local host port
  host="$(${SUDO} grep -oP '^GOBLIN_SERVER_HOST=\K.*' "${ENV_FILE}")"
  port="$(${SUDO} grep -oP '^GOBLIN_SERVER_PORT=\K.*' "${ENV_FILE}")"
  log "service is up. Open:"
  if [[ "${host}" == "0.0.0.0" ]]; then
    echo "  http://127.0.0.1:${port}"
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | while read -r ip; do
      echo "  http://${ip}:${port}"
    done
  else
    echo "  http://${host}:${port}"
  fi
}

start_and_verify() {
  local action="$1"
  ${SUDO} systemctl daemon-reload
  if [[ "${action}" == "install" ]]; then
    # enable --now alone won't replace an already-running instance (it is a
    # no-op start), so restart explicitly to pick up the rewritten unit.
    ${SUDO} systemctl enable "${SERVICE_NAME}"
    ${SUDO} systemctl restart "${SERVICE_NAME}"
  else
    ${SUDO} systemctl restart "${SERVICE_NAME}"
  fi
  sleep 2
  if ! ${SUDO} systemctl is-active --quiet "${SERVICE_NAME}"; then
    ${SUDO} systemctl status "${SERVICE_NAME}" --no-pager -l || true
    fail "service failed to start; see logs above (journalctl -u ${SERVICE_NAME})"
  fi
  print_urls
}

cmd_install() {
  local host="0.0.0.0" port="32200" data_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host) host="$2"; shift 2 ;;
      --port) port="$2"; shift 2 ;;
      --data-dir) data_dir="$2"; shift 2 ;;
      *) fail "unknown install option: $1" ;;
    esac
  done
  require_node
  require_bun
  build
  write_env_file "${host}" "${port}" "${data_dir}"
  write_unit
  start_and_verify install
}

cmd_update() {
  local pull=1
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-pull) pull=0; shift ;;
      *) fail "unknown update option: $1" ;;
    esac
  done
  [[ -f "${UNIT_PATH}" ]] || fail "service not installed yet; run: $0 install"
  require_node
  require_bun
  cd "${REPO_ROOT}"
  if [[ ${pull} -eq 1 ]]; then
    if [[ -n "$(git status --porcelain)" ]]; then
      log "working tree is dirty; skipping git pull (use --no-pull to silence)"
    elif ! git pull --ff-only; then
      log "git pull failed; continuing with the local checkout"
    fi
  fi
  build
  start_and_verify update
}

cmd_uninstall() {
  ${SUDO} systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
  ${SUDO} rm -f "${UNIT_PATH}"
  ${SUDO} systemctl daemon-reload
  log "service removed. Env file kept at ${ENV_FILE} (delete manually if unwanted)."
}

cmd="${1:-auto}"
[[ $# -gt 0 ]] && shift
case "${cmd}" in
  install) cmd_install "$@" ;;
  update) cmd_update "$@" ;;
  auto)
    if [[ -f "${UNIT_PATH}" ]]; then
      log "service already installed → updating"
      cmd_update "$@"
    else
      log "first run → installing"
      cmd_install "$@"
    fi
    ;;
  status) ${SUDO} systemctl status "${SERVICE_NAME}" --no-pager -l ;;
  logs) ${SUDO} journalctl -u "${SERVICE_NAME}" -n 100 --no-pager ;;
  uninstall) cmd_uninstall ;;
  *) fail "usage: $0 [install|update|status|logs|uninstall] [options]" ;;
esac
