import path from 'node:path'
import { execa, ExecaError } from 'execa'
import {
  FILE_TRANSFER_MAX_FILE_BYTES,
  FILE_TRANSFER_MAX_TOTAL_BYTES,
  FILE_TREE_MAX_ENTRIES,
} from '#/shared/file-tree.ts'
import { FIELD_SEP } from '#/system/git/parsers.ts'
import { buildManagedRemoteTerminalInvocation } from '#/system/remote-terminal.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import type { CreateWorktreeInput } from '#/shared/worktree-create.ts'

const SSH_COMMAND_TIMEOUT_MS = 15_000
const SSH_CONNECT_TIMEOUT_SEC = 10
export const REMOTE_SNAPSHOT_CURRENT_MARKER = '__GOBLIN_REMOTE_CURRENT__'
export const REMOTE_SNAPSHOT_DEFAULT_MARKER = '__GOBLIN_REMOTE_DEFAULT__'
export const REMOTE_SNAPSHOT_BRANCHES_MARKER = '__GOBLIN_REMOTE_BRANCHES__'

export type RemoteCommandKind =
  | { type: 'printHome' }
  | { type: 'checkShell' }
  | { type: 'checkGit' }
  | { type: 'testDirectory'; path: string }
  | { type: 'listDirectories'; path: string; limit?: number }
  | { type: 'listDirectoryEntries'; worktreePath: string; dirPath: string }
  | { type: 'searchFileTree'; worktreePath: string; query: string; limit: number }
  | { type: 'createFileTreeDirectory'; worktreePath: string; parentDirPath: string; name: string }
  | { type: 'renameFileTreeEntry'; worktreePath: string; oldPath: string; newName: string }
  | { type: 'deleteFileTreeEntries'; worktreePath: string; paths: string[] }
  | { type: 'moveFileTreeEntries'; worktreePath: string; paths: string[]; targetDirPath: string }
  | { type: 'fileTransferInventory'; rootPath: string; paths: string[] }
  | { type: 'fileTransferReadBase64'; path: string }
  | { type: 'fileTransferWriteBase64'; targetPath: string }
  | { type: 'fileTransferMkdir'; targetPath: string }
  | { type: 'fileTransferSymlink'; linkPath: string; target: string }
  | { type: 'revParseTopLevel'; path: string }
  | { type: 'gitSnapshot'; path: string }
  | { type: 'gitPatch'; path: string }
  | { type: 'gitWorktreeList'; path: string }
  | { type: 'gitStatus'; path: string }
  | { type: 'gitLog'; path: string; branch: string; count?: number; skip?: number }
  | { type: 'gitHistory'; path: string; branch: string; limit?: number; skip?: number }
  | { type: 'gitCommitMetadata'; path: string; commit: string }
  | { type: 'gitCommitNameStatus'; path: string; commit: string }
  | { type: 'gitCommitNumstat'; path: string; commit: string }
  | { type: 'gitFetchAll'; path: string }
  | { type: 'gitFetchRemote'; path: string; remote: string }
  | { type: 'gitStatusAll'; path: string }
  | { type: 'gitDiffNoIndex'; path: string; filePath: string }
  | { type: 'gitCheckout'; path: string; branch: string }
  | { type: 'gitPullCurrent'; path: string }
  | { type: 'gitCommitAll'; path: string; message: string }
  | { type: 'gitMerge'; path: string; branch: string }
  | { type: 'gitResetHard'; path: string }
  | { type: 'gitDiscardChanges'; path: string; paths: string[] }
  | { type: 'gitBranchCreate'; path: string; branch: string; baseBranch: string }
  | { type: 'gitBranchTrackRemote'; path: string; localBranch: string; remoteRef: string }
  | { type: 'gitFetchBranch'; path: string; remote: string; remoteBranch: string; branch: string }
  | { type: 'gitPush'; path: string; remote: string; branch: string; targetBranch: string; setUpstream: boolean }
  | { type: 'gitRemoteBranches'; path: string }
  | { type: 'gitWorktreeAdd'; path: string; input: CreateWorktreeInput }
  | { type: 'gitWorktreeRemove'; path: string; worktreePath: string }
  | { type: 'gitBranchDelete'; path: string; branch: string; force?: boolean }
  | { type: 'gitUpstream'; path: string; branch: string }
  | { type: 'gitIsAncestor'; path: string; ancestor: string; descendant: string }
  | { type: 'gitRemoteVerbose'; path: string }
  | { type: 'gitRemoteGetUrl'; path: string }

export interface RemoteCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  message?: string
  timedOut?: boolean
}

export interface RemoteCommandInvocation {
  command: 'ssh'
  args: string[]
  script: string
}

export interface RemoteCommandOptions {
  signal?: AbortSignal
  timeoutMs?: number
  stdin?: string
  maxBuffer?: number
}

export type RemoteCommandRunner = (
  command: RemoteCommandKind,
  target: RemoteRepoTarget,
  options?: RemoteCommandOptions,
) => Promise<RemoteCommandResult>

export function buildRemoteCommandInvocation(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
): RemoteCommandInvocation {
  const script = scriptForCommand(command)
  const args = [
    '-T',
    '-o',
    'RequestTTY=no',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`,
  ]
  const destination = target.alias
  args.push('--', destination, `sh -lc ${shellQuote(script)}`)
  return { command: 'ssh', args, script }
}

export function buildRemoteTerminalInvocation(
  target: RemoteRepoTarget,
  remotePath: string,
  options: { cols: number; rows: number; terminalNumber: number; useTmux?: boolean },
): RemoteCommandInvocation {
  const invocation = buildManagedRemoteTerminalInvocation(
    {
      alias: target.alias,
      endpoint: {
        user: target.user,
        host: target.host,
        port: target.port,
      },
      repoPath: target.remotePath,
      worktreePath: remotePath,
      terminalNumber: options.terminalNumber,
    },
    {
      sshOptions: ['-o', 'StrictHostKeyChecking=yes', '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`],
      useTmux: options.useTmux === true,
    },
  )
  if (!invocation) throw new Error('Invalid remote terminal invocation')
  return {
    command: invocation.command,
    args: invocation.args,
    script: invocation.script,
  }
}

export async function runRemoteCommand(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
  options?: RemoteCommandOptions,
): Promise<RemoteCommandResult> {
  if (options?.signal?.aborted) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
  const invocation = buildRemoteCommandInvocation(target, command)
  try {
    const { stdout, stderr } = await execa(invocation.command, invocation.args, {
      timeout: options?.timeoutMs ?? SSH_COMMAND_TIMEOUT_MS,
      cancelSignal: options?.signal,
      forceKillAfterDelay: 500,
      input: options?.stdin,
      maxBuffer: options?.maxBuffer ?? 2 * 1024 * 1024,
    })
    return { ok: true, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() }
  } catch (err) {
    const e = err as { stdout?: unknown; stderr?: unknown; timedOut?: boolean; isCanceled?: boolean; message?: string }
    const stdout = typeof e.stdout === 'string' ? e.stdout.trimEnd() : ''
    const stderr = typeof e.stderr === 'string' ? e.stderr.trimEnd() : ''
    if (options?.signal?.aborted || e.isCanceled === true) {
      return { ok: false, stdout, stderr, message: 'cancelled' }
    }
    if (err instanceof ExecaError && e.timedOut) {
      return { ok: false, stdout, stderr, message: 'timeout', timedOut: true }
    }
    return { ok: false, stdout, stderr, message: stderr || e.message || 'unknown' }
  }
}

function scriptForCommand(command: RemoteCommandKind): string {
  switch (command.type) {
    case 'printHome':
      return `printf '%s\\n' "$HOME"`
    case 'checkShell':
      return `printf '%s\\n' ok`
    case 'checkGit':
      return 'command -v git'
    case 'testDirectory':
      return `test -d ${shellQuote(command.path)}`
    case 'listDirectories': {
      const limit = Math.max(1, Math.min(50, Math.floor(command.limit ?? 20)))
      return `find ${shellQuote(
        command.path,
      )} -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | LC_ALL=C sort | head -n ${limit}`
    }
    case 'listDirectoryEntries':
      return [
        "python3 - <<'PY'",
        'import json, os, sys',
        `root = ${pythonString(command.worktreePath)}`,
        `dir_path = ${pythonString(command.dirPath)}`,
        'root_real = os.path.normpath(root)',
        'dir_real = os.path.normpath(dir_path)',
        "if dir_real != root_real and not dir_real.startswith(root_real.rstrip('/') + '/'):",
        '    print(json.dumps({"ok": False, "message": "error.invalid-path"}))',
        '    sys.exit(0)',
        'if not os.path.isdir(dir_real):',
        '    print(json.dumps({"ok": False, "message": "error.path-not-directory"}))',
        '    sys.exit(0)',
        'try:',
        '    names = os.listdir(dir_real)',
        'except PermissionError:',
        '    print(json.dumps({"ok": False, "message": "error.path-permission-denied"}))',
        '    sys.exit(0)',
        'except FileNotFoundError:',
        '    print(json.dumps({"ok": False, "message": "error.path-not-found"}))',
        '    sys.exit(0)',
        `if len(names) > ${FILE_TREE_MAX_ENTRIES}:`,
        '    print(json.dumps({"ok": False, "message": "error.file-tree-directory-too-large"}))',
        '    sys.exit(0)',
        'entries = []',
        'for name in names:',
        '    entry = os.path.join(dir_real, name)',
        '    target_kind = None',
        '    if os.path.islink(entry):',
        '        kind = "symlink"',
        '        if os.path.isdir(entry):',
        '            target_kind = "directory"',
        '        elif os.path.isfile(entry):',
        '            target_kind = "file"',
        '        else:',
        '            target_kind = "missing"',
        '    elif os.path.isdir(entry):',
        '        kind = "directory"',
        '    elif os.path.isfile(entry):',
        '        kind = "file"',
        '    else:',
        '        kind = "file"',
        '        target_kind = "other"',
        '    item = {"name": name, "kind": kind}',
        '    if target_kind:',
        '        item["targetKind"] = target_kind',
        '    entries.append(item)',
        'print(json.dumps({"ok": True, "entries": entries}, ensure_ascii=False))',
        'PY',
      ].join('\n')
    case 'searchFileTree':
      return remoteFileTreeSearchScript(command)
    case 'renameFileTreeEntry':
      return remoteRenameFileTreeScript(command)
    case 'createFileTreeDirectory':
      return remoteCreateFileTreeDirectoryScript(command)
    case 'deleteFileTreeEntries':
      return remoteDeleteFileTreeScript(command)
    case 'moveFileTreeEntries':
      return remoteMoveFileTreeScript(command)
    case 'fileTransferInventory':
      return remoteFileTransferInventoryScript(command)
    case 'fileTransferReadBase64':
      return `base64 < ${shellQuote(command.path)}`
    case 'fileTransferWriteBase64':
      return `mkdir -p ${shellQuote(path.posix.dirname(command.targetPath))} && base64 -d > ${shellQuote(command.targetPath)}`
    case 'fileTransferMkdir':
      return `mkdir -p ${shellQuote(command.targetPath)}`
    case 'fileTransferSymlink':
      return `ln -s -- ${shellQuote(command.target)} ${shellQuote(command.linkPath)}`
    case 'revParseTopLevel':
      return `git -C ${shellQuote(command.path)} rev-parse --show-toplevel`
    case 'gitSnapshot': {
      const repo = shellQuote(command.path)
      const branchFormat = [
        '%(refname:short)',
        '%(objectname:short)',
        '%(subject)',
        '%(authordate:iso-strict)',
        '%(authorname)',
        '%(upstream:short)',
        '%(upstream:track)',
      ].join(FIELD_SEP)
      return [
        `printf '%s\\n' ${shellQuote(REMOTE_SNAPSHOT_CURRENT_MARKER)}`,
        `git -C ${repo} symbolic-ref --short HEAD 2>/dev/null || true`,
        `printf '%s\\n' ${shellQuote(REMOTE_SNAPSHOT_DEFAULT_MARKER)}`,
        `git -C ${repo} symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'`,
        `printf '%s\\n' ${shellQuote(REMOTE_SNAPSHOT_BRANCHES_MARKER)}`,
        `git -C ${repo} for-each-ref --format=${shellQuote(branchFormat)} refs/heads/`,
      ].join('\n')
    }
    case 'gitPatch':
      return `git -C ${shellQuote(command.path)} diff HEAD --binary`
    case 'gitStatusAll':
      return `git -C ${shellQuote(command.path)} status --porcelain -z -uall`
    case 'gitDiffNoIndex':
      return [
        `git -C ${shellQuote(command.path)} diff --binary --no-index -- /dev/null ${shellQuote(command.filePath)}`,
        'code=$?',
        '[ "$code" -eq 0 ] || [ "$code" -eq 1 ]',
      ].join('; ')
    case 'gitWorktreeList':
      return `git -C ${shellQuote(command.path)} worktree list --porcelain`
    case 'gitStatus':
      return `git -C ${shellQuote(command.path)} status --porcelain -z`
    case 'gitLog': {
      const count = Math.max(1, Math.min(1000, Math.floor(command.count ?? 100)))
      const skip = Math.max(0, Math.floor(command.skip ?? 0))
      const format = ['%H', '%h', '%s', '%an', '%aI'].join(FIELD_SEP)
      return [
        `git -C ${shellQuote(command.path)} log`,
        `--format=${shellQuote(format)}`,
        `--max-count=${count}`,
        `--skip=${skip}`,
        shellQuote(command.branch),
        '--',
      ].join(' ')
    }
    case 'gitHistory': {
      const limit = Math.max(1, Math.min(200, Math.floor(command.limit ?? 100)))
      const skip = Math.max(0, Math.floor(command.skip ?? 0))
      const format = ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
      return [
        `git -C ${shellQuote(command.path)} log`,
        `--format=${shellQuote(format)}`,
        `--max-count=${limit}`,
        `--skip=${skip}`,
        shellQuote(command.branch),
        '--',
      ].join(' ')
    }
    case 'gitCommitMetadata': {
      const format = ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
      return `git -C ${shellQuote(command.path)} show -s --format=${shellQuote(format)} ${shellQuote(command.commit)}`
    }
    case 'gitCommitNameStatus':
      return `git -C ${shellQuote(command.path)} diff-tree --no-commit-id --name-status -r -M -C --root -z ${shellQuote(command.commit)}`
    case 'gitCommitNumstat':
      return `git -C ${shellQuote(command.path)} diff-tree --no-commit-id --numstat -r -M -C --root -z ${shellQuote(command.commit)}`
    case 'gitCheckout':
      return `git -C ${shellQuote(command.path)} switch -- ${shellQuote(command.branch)}`
    case 'gitFetchAll':
      return `git -C ${shellQuote(command.path)} fetch --all --prune`
    case 'gitFetchRemote':
      return `git -C ${shellQuote(command.path)} fetch --prune -- ${shellQuote(command.remote)}`
    case 'gitPullCurrent':
      return `git -C ${shellQuote(command.path)} pull --ff-only`
    case 'gitCommitAll':
      return [
        `git -C ${shellQuote(command.path)} add -A`,
        `git -C ${shellQuote(command.path)} commit -m ${shellQuote(command.message)}`,
      ].join(' && ')
    case 'gitMerge':
      return `git -C ${shellQuote(command.path)} merge -- ${shellQuote(command.branch)}`
    case 'gitResetHard':
      return `git -C ${shellQuote(command.path)} reset --hard`
    case 'gitDiscardChanges':
      return remoteDiscardChangesScript(command)
    case 'gitBranchCreate':
      return `git -C ${shellQuote(command.path)} branch -- ${shellQuote(command.branch)} ${shellQuote(command.baseBranch)}`
    case 'gitBranchTrackRemote':
      return `git -C ${shellQuote(command.path)} branch --track -- ${shellQuote(command.localBranch)} ${shellQuote(command.remoteRef)}`
    case 'gitFetchBranch':
      return `git -C ${shellQuote(command.path)} fetch -- ${shellQuote(command.remote)} ${shellQuote(
        `${command.remoteBranch}:${command.branch}`,
      )}`
    case 'gitPush':
      return [
        `git -C ${shellQuote(command.path)} push`,
        command.setUpstream ? '-u' : '',
        '--',
        shellQuote(command.remote),
        shellQuote(`${command.branch}:${command.targetBranch}`),
      ]
        .filter(Boolean)
        .join(' ')
    case 'gitRemoteBranches':
      return `git -C ${shellQuote(command.path)} for-each-ref ${shellQuote('--format=%(refname:short)')} refs/remotes/`
    case 'gitWorktreeAdd':
      return `git -C ${shellQuote(command.path)} worktree add ${remoteWorktreeAddArgs(command.input)}`
    case 'gitWorktreeRemove':
      return `git -C ${shellQuote(command.path)} worktree remove -- ${shellQuote(command.worktreePath)}`
    case 'gitBranchDelete':
      return `git -C ${shellQuote(command.path)} branch ${command.force ? '-D' : '-d'} -- ${shellQuote(command.branch)}`
    case 'gitUpstream':
      return `git -C ${shellQuote(command.path)} rev-parse --abbrev-ref ${shellQuote(`${command.branch}@{u}`)}`
    case 'gitIsAncestor':
      return `git -C ${shellQuote(command.path)} merge-base --is-ancestor -- ${shellQuote(
        command.ancestor,
      )} ${shellQuote(command.descendant)}`
    case 'gitRemoteGetUrl':
      return `git -C ${shellQuote(command.path)} remote get-url origin`
    case 'gitRemoteVerbose':
      return `git -C ${shellQuote(command.path)} remote -v`
  }
  const exhaustive: never = command
  return exhaustive
}

function remoteFileTreeSearchScript(command: Extract<RemoteCommandKind, { type: 'searchFileTree' }>): string {
  const payload = {
    worktreePath: command.worktreePath,
    query: command.query,
    limit: Math.max(1, Math.min(200, Math.floor(command.limit))),
  }
  return [
    "python3 - <<'PY'",
    'import json, os, subprocess, sys',
    `payload = ${pythonString(JSON.stringify(payload))}`,
    'data = json.loads(payload)',
    'root = os.path.normpath(data["worktreePath"])',
    'query = str(data["query"]).strip().lower()',
    'limit = int(data["limit"])',
    'skip = {".git", "node_modules", "dist", "build", ".next", ".turbo", ".cache", "coverage"}',
    'def fail(message):',
    '    print(json.dumps({"ok": False, "message": message}))',
    '    sys.exit(0)',
    'if not root or not os.path.isabs(root) or not query:',
    '    fail("error.invalid-arguments")',
    'if not os.path.isdir(root):',
    '    fail("error.path-not-directory")',
    'def basename(p):',
    '    return p.rsplit("/", 1)[-1]',
    'def rank(p):',
    '    name = basename(p).lower()',
    '    value = p.lower()',
    '    if name.startswith(query): return 0',
    '    if query in name: return 1',
    '    if value.startswith(query): return 2',
    '    if query in value: return 3',
    '    return None',
    'def skipped(p):',
    '    return any(part in skip for part in p.split("/"))',
    'try:',
    '    raw = subprocess.check_output(["git", "-C", root, "ls-files", "-co", "--exclude-standard", "-z"], stderr=subprocess.PIPE)',
    'except subprocess.CalledProcessError as exc:',
    '    fail(exc.stderr.decode("utf-8", "replace") if exc.stderr else "error.failed-read-repo")',
    'paths = [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\\0") if p]',
    'items = {}',
    'for rel in paths:',
    '    if rel.startswith("/") or "\\x00" in rel or skipped(rel):',
    '        continue',
    '    items.setdefault(rel, {"relativePath": rel, "kind": "file"})',
    '    parts = [part for part in rel.split("/") if part]',
    '    for i in range(1, len(parts)):',
    '        directory = "/".join(parts[:i])',
    '        if not skipped(directory):',
    '            items.setdefault(directory, {"relativePath": directory, "kind": "directory"})',
    'matches = [item for item in items.values() if rank(item["relativePath"]) is not None]',
    'matches.sort(key=lambda item: (rank(item["relativePath"]), item["relativePath"].lower()))',
    'print(json.dumps({"ok": True, "matches": matches[:limit], "truncated": len(matches) > limit, "limit": limit}, ensure_ascii=False))',
    'PY',
  ].join('\n')
}

function remoteDiscardChangesScript(command: Extract<RemoteCommandKind, { type: 'gitDiscardChanges' }>): string {
  const repo = shellQuote(command.path)
  const pathspecs = command.paths.map((item) => shellQuote(item)).join(' ')
  const restoreCommands = command.paths.map((pathspec) => {
    const quoted = shellQuote(pathspec)
    return `{ git -C ${repo} ls-files --error-unmatch -- ${quoted} >/dev/null 2>&1; code=$?; if [ "$code" -eq 0 ]; then git -C ${repo} restore --staged --worktree --source=HEAD -- ${quoted}; elif [ "$code" -ne 1 ]; then exit "$code"; fi; }`
  })
  return [...restoreCommands, `git -C ${repo} clean -fd -- ${pathspecs}`].join(' && ')
}

function shellQuote(value: string): string {
  if (value.includes('\0'))
    throw new Error(`Refusing to quote NUL-containing string for remote command: ${path.basename(value)}`)
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function pythonString(value: string): string {
  return JSON.stringify(value)
}

function pythonJson(value: unknown): string {
  return JSON.stringify(value)
}

function remoteFileTreePreamble(worktreePath: string): string[] {
  return [
    'import json, os, shutil, sys',
    `root = ${pythonString(worktreePath)}`,
    'root_real = os.path.normpath(root)',
    'def finish(ok, message=""):',
    '    print(json.dumps({"ok": ok, "message": message}))',
    '    sys.exit(0)',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def writable_target(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        finish(False, "error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        finish(False, "error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        finish(False, "error.invalid-path")',
    '    if candidate == root_real:',
    '        finish(False, "error.delete-root-forbidden")',
    '    return candidate',
  ]
}

function remoteRenameFileTreeScript(command: Extract<RemoteCommandKind, { type: 'renameFileTreeEntry' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteFileTreePreamble(command.worktreePath),
    `old_path = writable_target(${pythonString(command.oldPath)})`,
    `new_name = ${pythonString(command.newName)}`,
    'if not isinstance(new_name, str) or not new_name or new_name in (".", "..") or "/" in new_name or "\\x00" in new_name:',
    '    finish(False, "error.invalid-arguments")',
    'new_path = os.path.join(os.path.dirname(old_path), new_name)',
    'if not inside_root(new_path):',
    '    finish(False, "error.invalid-path")',
    'if os.path.lexists(new_path):',
    '    finish(False, "error.file-exists")',
    'try:',
    '    os.rename(old_path, new_path)',
    '    finish(True)',
    'except FileNotFoundError:',
    '    finish(False, "error.path-not-found")',
    'except PermissionError:',
    '    finish(False, "error.path-permission-denied")',
    'except OSError:',
    '    finish(False, "error.failed-read-repo")',
    'PY',
  ].join('\n')
}

function remoteCreateFileTreeDirectoryScript(command: Extract<RemoteCommandKind, { type: 'createFileTreeDirectory' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteFileTreePreamble(command.worktreePath),
    `parent_dir = ${pythonString(command.parentDirPath)}`,
    `name = ${pythonString(command.name)}`,
    'if not isinstance(parent_dir, str) or not parent_dir or "\\x00" in parent_dir:',
    '    finish(False, "error.invalid-arguments")',
    'parent_dir = os.path.normpath(parent_dir)',
    'if not os.path.isabs(parent_dir):',
    '    finish(False, "error.invalid-arguments")',
    'if not inside_root(parent_dir):',
    '    finish(False, "error.invalid-path")',
    'if not os.path.isdir(parent_dir):',
    '    finish(False, "error.path-not-directory")',
    'if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\\x00" in name:',
    '    finish(False, "error.invalid-arguments")',
    'target = os.path.normpath(os.path.join(parent_dir, name))',
    'if not inside_root(target):',
    '    finish(False, "error.invalid-path")',
    'if os.path.lexists(target):',
    '    finish(False, "error.file-exists")',
    'try:',
    '    os.mkdir(target)',
    '    finish(True)',
    'except FileExistsError:',
    '    finish(False, "error.file-exists")',
    'except FileNotFoundError:',
    '    finish(False, "error.path-not-found")',
    'except PermissionError:',
    '    finish(False, "error.path-permission-denied")',
    'except OSError:',
    '    finish(False, "error.failed-read-repo")',
    'PY',
  ].join('\n')
}

function remoteDeleteFileTreeScript(command: Extract<RemoteCommandKind, { type: 'deleteFileTreeEntries' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteFileTreePreamble(command.worktreePath),
    `paths = ${pythonJson(command.paths)}`,
    'if not isinstance(paths, list) or len(paths) == 0:',
    '    finish(False, "error.invalid-arguments")',
    'targets = [writable_target(item) for item in paths]',
    'try:',
    '    for target in targets:',
    '        if os.path.isdir(target) and not os.path.islink(target):',
    '            shutil.rmtree(target)',
    '        else:',
    '            os.remove(target)',
    '    finish(True)',
    'except FileNotFoundError:',
    '    finish(False, "error.path-not-found")',
    'except PermissionError:',
    '    finish(False, "error.path-permission-denied")',
    'except OSError:',
    '    finish(False, "error.failed-read-repo")',
    'PY',
  ].join('\n')
}

function remoteMoveFileTreeScript(command: Extract<RemoteCommandKind, { type: 'moveFileTreeEntries' }>): string {
  return [
    "python3 - <<'PY'",
    ...remoteFileTreePreamble(command.worktreePath),
    `paths = ${pythonJson(command.paths)}`,
    `target_dir = ${pythonString(command.targetDirPath)}`,
    'if not isinstance(paths, list) or len(paths) == 0:',
    '    finish(False, "error.invalid-arguments")',
    'if not isinstance(target_dir, str) or not target_dir or "\\x00" in target_dir:',
    '    finish(False, "error.invalid-arguments")',
    'target_dir = os.path.normpath(target_dir)',
    'if not os.path.isabs(target_dir):',
    '    finish(False, "error.invalid-arguments")',
    'if not inside_root(target_dir):',
    '    finish(False, "error.invalid-path")',
    'if not os.path.isdir(target_dir):',
    '    finish(False, "error.path-not-directory")',
    'targets = [writable_target(item) for item in paths]',
    'seen = set()',
    'moves = []',
    'for source in targets:',
    '    destination = os.path.normpath(os.path.join(target_dir, os.path.basename(source)))',
    '    if destination == source:',
    '        continue',
    '    if not inside_root(destination):',
    '        finish(False, "error.invalid-path")',
    '    if os.path.isdir(source) and not os.path.islink(source):',
    "        if target_dir == source or target_dir.startswith(source.rstrip('/') + '/'):",
    '            finish(False, "error.invalid-path")',
    '    if destination in seen or os.path.lexists(destination):',
    '        finish(False, "error.file-exists")',
    '    seen.add(destination)',
    '    moves.append((source, destination))',
    'try:',
    '    for source, destination in moves:',
    '        os.rename(source, destination)',
    '    finish(True)',
    'except FileNotFoundError:',
    '    finish(False, "error.path-not-found")',
    'except PermissionError:',
    '    finish(False, "error.path-permission-denied")',
    'except OSError:',
    '    finish(False, "error.failed-read-repo")',
    'PY',
  ].join('\n')
}

function remoteFileTransferInventoryScript(
  command: Extract<RemoteCommandKind, { type: 'fileTransferInventory' }>,
): string {
  return [
    "python3 - <<'PY'",
    '# fileTransferInventory',
    'import json, os, stat, sys',
    `root = ${pythonString(command.rootPath)}`,
    `paths = ${pythonJson(command.paths)}`,
    `max_entries = ${FILE_TREE_MAX_ENTRIES}`,
    `max_file_bytes = ${FILE_TRANSFER_MAX_FILE_BYTES}`,
    `max_total_bytes = ${FILE_TRANSFER_MAX_TOTAL_BYTES}`,
    'root_real = os.path.normpath(root)',
    'entries = []',
    'total_bytes = 0',
    'def finish(payload):',
    '    print(json.dumps(payload, ensure_ascii=False))',
    '    sys.exit(0)',
    'def fail(message):',
    '    finish({"ok": False, "message": message})',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def source_path(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        fail("error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        fail("error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        fail("error.file-transfer-source-outside-worktree")',
    '    return candidate',
    'def add_entry(path_value, kind, size, link_target=None):',
    '    item = {"path": path_value, "relativePath": os.path.relpath(path_value, root_real), "kind": kind, "size": size}',
    '    if link_target is not None:',
    '        item["linkTarget"] = link_target',
    '    entries.append(item)',
    '    if len(entries) > max_entries:',
    '        fail("error.file-tree-directory-too-large")',
    'def inventory_one(path_value):',
    '    global total_bytes',
    '    try:',
    '        info = os.lstat(path_value)',
    '    except FileNotFoundError:',
    '        fail("error.path-not-found")',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    mode = info.st_mode',
    '    if stat.S_ISLNK(mode):',
    '        try:',
    '            link_target = os.readlink(path_value)',
    '        except OSError:',
    '            link_target = ""',
    '        add_entry(path_value, "symlink", 0, link_target)',
    '        return',
    '    if stat.S_ISREG(mode):',
    '        if info.st_size > max_file_bytes:',
    '            fail("error.file-transfer-file-too-large")',
    '        total_bytes += info.st_size',
    '        if total_bytes > max_total_bytes:',
    '            fail("error.file-transfer-total-too-large")',
    '        add_entry(path_value, "file", info.st_size)',
    '        return',
    '    if stat.S_ISDIR(mode):',
    '        add_entry(path_value, "directory", 0)',
    '        try:',
    '            names = os.listdir(path_value)',
    '        except PermissionError:',
    '            fail("error.path-permission-denied")',
    '        for name in sorted(names):',
    '            inventory_one(os.path.join(path_value, name))',
    '        return',
    '    fail("error.invalid-path")',
    'if not isinstance(paths, list) or len(paths) == 0:',
    '    fail("error.invalid-arguments")',
    'for item in paths:',
    '    inventory_one(source_path(item))',
    'finish({"ok": True, "entries": entries, "totalBytes": total_bytes})',
    'PY',
  ].join('\n')
}

function remoteWorktreeAddArgs(input: CreateWorktreeInput): string {
  switch (input.mode.kind) {
    case 'newBranch':
      return [
        '-b',
        shellQuote(input.mode.newBranch),
        '--',
        shellQuote(input.worktreePath),
        shellQuote(input.mode.baseRef),
      ].join(' ')
    case 'existingBranch':
      return ['--', shellQuote(input.worktreePath), shellQuote(input.mode.branch)].join(' ')
    case 'trackRemoteBranch':
      return [
        '-b',
        shellQuote(input.mode.localBranch),
        '--track',
        '--',
        shellQuote(input.worktreePath),
        shellQuote(input.mode.remoteRef),
      ].join(' ')
    case 'detached':
      return ['--detach', '--', shellQuote(input.worktreePath), shellQuote(input.mode.ref)].join(' ')
  }
}
