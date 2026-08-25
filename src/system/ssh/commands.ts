import path from 'node:path'
import { execa, ExecaError } from 'execa'
import {
  FILE_TRANSFER_MAX_FILE_BYTES,
  FILE_TRANSFER_MAX_TOTAL_BYTES,
  FILE_TREE_MAX_ENTRIES,
  FILE_TREE_TEXT_FILE_MAX_BYTES,
} from '#/shared/file-tree.ts'
import { BRANCH_WORKSPACE_DIRECTORY_PREFIXES } from '#/shared/branch-workspaces.ts'
import {
  buildTmuxServerName,
  isHobgoblinTmuxSessionName,
  isHobgoblinTmuxServerName,
  isSafeTmuxSessionName,
} from '#/system/tmux-session.ts'
import { FIELD_SEP } from '#/system/git/parsers.ts'
import { BRANCH_CREATED_FROM_CONFIG_PATTERN, branchCreatedFromConfigKey } from '#/system/git/branches.ts'
import { buildManagedRemoteTerminalInvocation } from '#/system/remote-terminal.ts'
import { TMUX_HOST_SESSION_LIST_FORMAT, TMUX_SESSION_LIST_FORMAT } from '#/system/tmux-cleanup.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { worktreeCreationBaseRef, type CreateWorktreeInput } from '#/shared/worktree-create.ts'

const SSH_COMMAND_TIMEOUT_MS = 15_000
const SSH_CONNECT_TIMEOUT_SEC = 10
export const REMOTE_SNAPSHOT_CURRENT_MARKER = '__GOBLIN_REMOTE_CURRENT__'
export const REMOTE_SNAPSHOT_DEFAULT_MARKER = '__GOBLIN_REMOTE_DEFAULT__'
export const REMOTE_SNAPSHOT_BRANCHES_MARKER = '__GOBLIN_REMOTE_BRANCHES__'
export const REMOTE_SNAPSHOT_CREATED_FROM_MARKER = '__HOBGOBLIN_REMOTE_BRANCH_CREATED_FROM__'
export const REMOTE_PATH_EXISTS_MARKER = '__HOBGOBLIN_PATH_EXISTS__'
export const REMOTE_PATH_MISSING_MARKER = '__HOBGOBLIN_PATH_MISSING__'
export const REMOTE_WORKSPACE_LINKED_WORKTREE_MARKER = '__HOBGOBLIN_WORKSPACE_LINKED_WORKTREE__'

export type RemoteCommandKind =
  | { type: 'printHome' }
  | { type: 'checkShell' }
  | { type: 'checkGit' }
  | { type: 'tmuxListSessions'; projectRoot: string }
  | { type: 'tmuxKillSessionByName'; projectRoot: string; sessionName: string; serverName?: string }
  | { type: 'tmuxCancelModeBySessionName'; projectRoot: string; sessionName: string; serverName?: string }
  | {
      type: 'tmuxPageBySessionName'
      projectRoot: string
      sessionName: string
      serverName?: string
      direction: 'up' | 'down'
    }
  | { type: 'tmuxListHostSessions' }
  | { type: 'tmuxKillHostSessionByName'; sessionName: string; serverName?: string }
  | { type: 'testDirectory'; path: string }
  | { type: 'listDirectories'; path: string; limit?: number }
  | { type: 'listWorkspaceGitDirectories'; rootPath: string }
  | { type: 'testWorkspaceGitDirectory'; path: string }
  | { type: 'testPathExists'; path: string }
  | { type: 'listBranchWorkspaceCandidates'; rootPath: string; excludedNames: string[] }
  | { type: 'inspectBranchWorkspacePath'; rootPath: string; candidatePath: string }
  | { type: 'createBranchWorkspaceDirectory'; rootPath: string; targetPath: string }
  | {
      type: 'materializeBranchWorkspaceSymlink'
      rootPath: string
      sourcePath: string
      targetPath: string
    }
  | { type: 'copyBranchWorkspaceEntry'; rootPath: string; sourcePath: string; targetPath: string }
  | { type: 'fingerprintBranchWorkspaceEntry'; rootPath: string; targetPath: string }
  | { type: 'removeBranchWorkspaceEntry'; rootPath: string; targetPath: string }
  | { type: 'listBranchWorkspaceChildren'; rootPath: string; targetPath: string }
  | { type: 'listDirectoryEntries'; worktreePath: string; dirPath: string }
  | { type: 'searchFileTree'; worktreePath: string; query: string; limit: number }
  | { type: 'createFileTreeDirectory'; worktreePath: string; parentDirPath: string; name: string }
  | { type: 'createFileTreeFile'; worktreePath: string; parentDirPath: string; name: string }
  | { type: 'createFileTreeTextFile'; worktreePath: string; parentDirPath: string; name: string }
  | { type: 'readFileTreeTextFile'; worktreePath: string; filePath: string }
  | { type: 'replaceFileTreeTextFile'; worktreePath: string; filePath: string }
  | { type: 'readFileTreeBinaryFile'; worktreePath: string; filePath: string; maxBytes: number }
  | { type: 'replaceFileTreeBinaryFile'; worktreePath: string; filePath: string; maxBytes: number }
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
  | { type: 'gitWorktreePrune'; path: string }
  | { type: 'gitStatus'; path: string }
  | { type: 'gitWorktreeContentState'; path: string }
  | { type: 'gitHistory'; path: string; branch: string; limit?: number; skip?: number }
  | { type: 'gitCommitMetadata'; path: string; commit: string }
  | { type: 'gitCommitNameStatus'; path: string; commit: string }
  | { type: 'gitCommitNumstat'; path: string; commit: string }
  | { type: 'gitFetchAll'; path: string }
  | { type: 'gitFetchRemote'; path: string; remote: string }
  | { type: 'gitStatusAll'; path: string }
  | { type: 'gitDiffNoIndex'; path: string; filePath: string }
  | { type: 'gitCheckout'; path: string; branch: string }
  | { type: 'gitCheckoutTracking'; path: string; localBranch: string; remoteRef: string }
  | { type: 'gitPullCurrent'; path: string }
  | { type: 'gitCommitAll'; path: string; message: string }
  | { type: 'gitMerge'; path: string; branch: string }
  | { type: 'gitResetHard'; path: string }
  | {
      type: 'gitAlignToRemote'
      path: string
      branch: string
      expectedHead: string
      remoteRef: string
      remoteHead: string
      expectedIndexHash: string
      expectedWorktreeTree: string
    }
  | { type: 'gitDiscardChanges'; path: string; paths: string[] }
  | { type: 'gitBranchCreate'; path: string; branch: string; baseBranch: string }
  | { type: 'gitBranchTrackRemote'; path: string; localBranch: string; remoteRef: string }
  | { type: 'gitBranchSetUpstream'; path: string; branch: string; remoteRef: string | null }
  | { type: 'gitFetchBranch'; path: string; remote: string; remoteBranch: string; branch: string }
  | { type: 'gitPush'; path: string; remote: string; branch: string; targetBranch: string; setUpstream: boolean }
  | { type: 'gitPushWorktreeHead'; path: string; remote: string; targetBranch: string }
  | { type: 'gitTags'; path: string }
  | { type: 'gitTagCreate'; path: string; name: string; ref: string }
  | { type: 'gitTagDelete'; path: string; name: string }
  | { type: 'gitRemoteBranches'; path: string }
  | { type: 'gitRemoteBranchInfo'; path: string }
  | { type: 'gitRemoteTags'; path: string; remote: string }
  | { type: 'gitRemoteBranchDelete'; path: string; remote: string; branch: string }
  | { type: 'gitRemoteTagDelete'; path: string; remote: string; tag: string }
  | { type: 'gitTagPush'; path: string; remote: string; tag: string }
  | { type: 'gitWorktreeAdd'; path: string; input: CreateWorktreeInput }
  | { type: 'gitWorktreeRemove'; path: string; worktreePath: string; force?: boolean }
  | { type: 'gitBranchDelete'; path: string; branch: string; force?: boolean }
  | { type: 'gitUpstream'; path: string; branch: string }
  | { type: 'gitIsAncestor'; path: string; ancestor: string; descendant: string }
  | { type: 'gitRemoteVerbose'; path: string }
  | { type: 'gitRemoteGetUrl'; path: string }
  | {
      type: 'bootstrapRemoteWorktree'
      sourceRoot: string
      targetRoot: string
      copy: string[]
      symlink: string[]
    }

export interface RemoteCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  message?: string
  timedOut?: boolean
}

export interface RemoteCommandInvocation {
  command: string
  args: string[]
  script: string
  tmuxSessionName?: string | null
}

export interface RemoteCommandOptions {
  signal?: AbortSignal
  timeoutMs?: number
  stdin?: string
  maxBuffer?: number
  wslEnvironment?: Record<string, string>
}

export function buildRemoteCommandInvocation(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
): RemoteCommandInvocation {
  const script = scriptForCommand(command)
  if (target.transport === 'wsl') {
    if (!target.wslExecutable) throw new Error('error.wsl-unavailable')
    return {
      command: target.wslExecutable,
      args: ['--distribution', target.alias, '--exec', 'sh', '-lc', script],
      script,
    }
  }
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
  options: {
    cols: number
    rows: number
    terminalNumber: number
    useTmux?: boolean
    existingTmuxSessionName?: string
    existingTmuxServerName?: string
  },
): RemoteCommandInvocation {
  const invocation = buildManagedRemoteTerminalInvocation(
    {
      alias: target.transport === 'wsl' ? 'wsl' : target.alias,
      projectRoot: target.remotePath,
      workingDirectory: remotePath,
      terminalNumber: options.terminalNumber,
    },
    {
      sshOptions: ['-o', 'StrictHostKeyChecking=yes', '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`],
      useTmux: options.useTmux === true,
      existingTmuxSessionName: options.existingTmuxSessionName,
      existingTmuxServerName: options.existingTmuxServerName,
    },
  )
  if (!invocation) throw new Error('Invalid remote terminal invocation')
  if (target.transport === 'wsl') {
    if (!target.wslExecutable) throw new Error('error.wsl-unavailable')
    return {
      command: target.wslExecutable,
      args: ['--distribution', target.alias, '--exec', 'sh', '-lc', invocation.script],
      script: invocation.script,
      tmuxSessionName: invocation.tmuxSessionName,
    }
  }
  return {
    command: invocation.command,
    args: invocation.args,
    script: invocation.script,
    tmuxSessionName: invocation.tmuxSessionName,
  }
}

export async function runRemoteCommand(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
  options?: RemoteCommandOptions,
): Promise<RemoteCommandResult> {
  if (options?.signal?.aborted) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
  const invocation = buildRemoteCommandInvocation(target, command)
  const wslEnvironment =
    target.transport === 'wsl' ? buildWslProcessEnvironment(options?.wslEnvironment, process.env) : undefined
  try {
    const { stdout, stderr } = await execa(invocation.command, invocation.args, {
      timeout: options?.timeoutMs ?? SSH_COMMAND_TIMEOUT_MS,
      cancelSignal: options?.signal,
      forceKillAfterDelay: 500,
      input: options?.stdin,
      maxBuffer: options?.maxBuffer ?? 2 * 1024 * 1024,
      ...(wslEnvironment ? { env: wslEnvironment } : {}),
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

function buildWslProcessEnvironment(
  values: Record<string, string> | undefined,
  inherited: NodeJS.ProcessEnv,
): Record<string, string> | undefined {
  const entries = Object.entries(values ?? {}).filter(
    (entry): entry is [string, string] => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry[0]) && typeof entry[1] === 'string',
  )
  if (entries.length === 0) return undefined

  const inheritedWslEnv = environmentValue(inherited, 'WSLENV')
  const names = inheritedWslEnv?.split(':').filter(Boolean) ?? []
  const seen = new Set(
    names
      .map(wslEnvEntryName)
      .filter(Boolean)
      .map((name) => name.toLowerCase()),
  )
  for (const [name] of entries) {
    const identity = name.toLowerCase()
    if (seen.has(identity)) continue
    seen.add(identity)
    names.push(name)
  }

  return {
    ...Object.fromEntries(entries),
    WSLENV: names.join(':'),
  }
}

function wslEnvEntryName(entry: string): string {
  return entry.slice(0, entry.indexOf('/') < 0 ? undefined : entry.indexOf('/'))
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key, value]) => key.toUpperCase() === name && typeof value === 'string')
  const value = match?.[1]?.trim()
  return value || undefined
}

function scriptForCommand(command: RemoteCommandKind): string {
  switch (command.type) {
    case 'printHome':
      return `printf '%s\\n' "$HOME"`
    case 'checkShell':
      return `printf '%s\\n' ok`
    case 'checkGit':
      return 'command -v git'
    case 'tmuxListSessions':
      return tmuxListSessionsScript(command.projectRoot)
    case 'tmuxListHostSessions':
      return tmuxListHostSessionsScript()
    case 'tmuxKillSessionByName': {
      const serverName = buildTmuxServerName(command.projectRoot)
      if (
        !serverName ||
        !isHobgoblinTmuxSessionName(command.sessionName) ||
        (command.serverName !== undefined && command.serverName !== serverName)
      ) {
        throw new TypeError('error.invalid-arguments')
      }
      return [
        'command -v tmux >/dev/null 2>&1 || exit 127',
        `tmux${command.serverName ? ` -L ${shellQuote(command.serverName)}` : ''} kill-session -t ${shellQuote(`=${command.sessionName}`)}`,
      ].join('\n')
    }
    case 'tmuxCancelModeBySessionName': {
      const serverName = buildTmuxServerName(command.projectRoot)
      if (
        !serverName ||
        !isHobgoblinTmuxSessionName(command.sessionName) ||
        (command.serverName !== undefined && command.serverName !== serverName)
      ) {
        throw new TypeError('error.invalid-arguments')
      }
      return [
        'command -v tmux >/dev/null 2>&1 || exit 127',
        `tmux${command.serverName ? ` -L ${shellQuote(command.serverName)}` : ''} copy-mode -q -t ${shellQuote(`=${command.sessionName}:`)}`,
      ].join('\n')
    }
    case 'tmuxPageBySessionName': {
      const serverName = buildTmuxServerName(command.projectRoot)
      if (
        !serverName ||
        !isHobgoblinTmuxSessionName(command.sessionName) ||
        (command.serverName !== undefined && command.serverName !== serverName) ||
        (command.direction !== 'up' && command.direction !== 'down')
      ) {
        throw new TypeError('error.invalid-arguments')
      }
      const copyModeFlag = command.direction === 'up' ? '-eu' : '-ed'
      return [
        'command -v tmux >/dev/null 2>&1 || exit 127',
        `tmux${command.serverName ? ` -L ${shellQuote(command.serverName)}` : ''} copy-mode ${copyModeFlag} -t ${shellQuote(`=${command.sessionName}:`)}`,
      ].join('\n')
    }
    case 'tmuxKillHostSessionByName': {
      if (
        !(command.serverName === undefined
          ? isSafeTmuxSessionName(command.sessionName)
          : isHobgoblinTmuxSessionName(command.sessionName)) ||
        (command.serverName !== undefined && !isHobgoblinTmuxServerName(command.serverName))
      ) {
        throw new TypeError('error.invalid-arguments')
      }
      const serverName = command.serverName ?? 'default'
      return [
        'command -v tmux >/dev/null 2>&1 || exit 127',
        ...tmuxSocketDirectoryScript(),
        `tmux_socket="$tmux_socket_dir/${serverName}"`,
        "[ -S \"$tmux_socket\" ] || { printf '%s\\n' 'no server running on selected socket' >&2; exit 1; }",
        `tmux -S "$tmux_socket" kill-session -t ${shellQuote(`=${command.sessionName}`)}`,
      ].join('\n')
    }
    case 'testDirectory':
      return `test -d ${shellQuote(command.path)}`
    case 'listDirectories': {
      const limit = Math.max(1, Math.min(50, Math.floor(command.limit ?? 20)))
      return `find ${shellQuote(
        command.path,
      )} -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | LC_ALL=C sort | head -n ${limit}`
    }
    case 'listWorkspaceGitDirectories': {
      const rootPath = shellQuote(command.rootPath)
      return [
        `find ${rootPath} -mindepth 1 -maxdepth 1 \\( -type d -o -type l \\) -exec sh -c '`,
        'for candidate do',
        '  if [ -d "$candidate" ] && { [ -d "$candidate/.git" ] || [ -f "$candidate/.git" ]; }; then',
        '    candidate_root=$(cd "$candidate" 2>/dev/null && pwd -P) || continue',
        '    git_root=$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null) || continue',
        '    git_root=$(cd "$git_root" 2>/dev/null && pwd -P) || continue',
        '    git_dir=$(git -C "$candidate" rev-parse --git-dir 2>/dev/null) || continue',
        '    git_common_dir=$(git -C "$candidate" rev-parse --git-common-dir 2>/dev/null) || continue',
        '    if [ "$candidate_root" = "$git_root" ] && [ "$git_dir" = "$git_common_dir" ]; then',
        '      printf "%s\\0" "$candidate"',
        '    fi',
        '  fi',
        'done',
        "' sh {} +",
      ].join('\n')
    }
    case 'testWorkspaceGitDirectory': {
      const candidatePath = shellQuote(command.path)
      return [
        `candidate_path=${candidatePath}`,
        'candidate_root=$(cd "$candidate_path" 2>/dev/null && pwd -P) || exit 1',
        'git_root=$(git -C "$candidate_path" rev-parse --show-toplevel 2>/dev/null) || exit 1',
        'git_root=$(cd "$git_root" 2>/dev/null && pwd -P) || exit 1',
        'git_dir=$(git -C "$candidate_path" rev-parse --git-dir 2>/dev/null) || exit 1',
        'git_common_dir=$(git -C "$candidate_path" rev-parse --git-common-dir 2>/dev/null) || exit 1',
        '[ "$candidate_root" = "$git_root" ] || exit 1',
        'if [ "$git_dir" != "$git_common_dir" ]; then',
        `  printf '%s\\n' ${shellQuote(REMOTE_WORKSPACE_LINKED_WORKTREE_MARKER)}`,
        '  exit 1',
        'fi',
      ].join('\n')
    }
    case 'testPathExists': {
      const candidatePath = shellQuote(command.path)
      return [
        `if test -e ${candidatePath} || test -L ${candidatePath}; then`,
        `  printf '%s\\n' ${shellQuote(REMOTE_PATH_EXISTS_MARKER)}`,
        'else',
        `  printf '%s\\n' ${shellQuote(REMOTE_PATH_MISSING_MARKER)}`,
        'fi',
      ].join('\n')
    }
    case 'listBranchWorkspaceCandidates':
    case 'inspectBranchWorkspacePath':
    case 'createBranchWorkspaceDirectory':
    case 'materializeBranchWorkspaceSymlink':
    case 'copyBranchWorkspaceEntry':
    case 'fingerprintBranchWorkspaceEntry':
    case 'removeBranchWorkspaceEntry':
    case 'listBranchWorkspaceChildren':
      return remoteBranchWorkspaceScript(command)
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
    case 'createFileTreeFile':
      return remoteCreateFileTreeFileScript(command)
    case 'createFileTreeTextFile':
      return remoteCreateFileTreeTextFileScript(command)
    case 'readFileTreeTextFile':
      return remoteReadFileTreeTextFileScript(command)
    case 'replaceFileTreeTextFile':
      return remoteReplaceFileTreeTextFileScript(command)
    case 'readFileTreeBinaryFile':
      return remoteReadFileTreeBinaryFileScript(command)
    case 'replaceFileTreeBinaryFile':
      return remoteReplaceFileTreeBinaryFileScript(command)
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
        `printf '%s\\n' ${shellQuote(REMOTE_SNAPSHOT_CREATED_FROM_MARKER)}`,
        `git -C ${repo} config --local --get-regexp ${shellQuote(BRANCH_CREATED_FROM_CONFIG_PATTERN)} 2>/dev/null || true`,
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
      return `git -C ${shellQuote(command.path)} worktree list --porcelain --expire now`
    case 'gitWorktreePrune':
      return `git -C ${shellQuote(command.path)} worktree prune --expire now`
    case 'gitStatus':
      return `git -C ${shellQuote(command.path)} status --porcelain -z`
    case 'gitWorktreeContentState': {
      const repo = shellQuote(command.path)
      return [...remoteWorktreeContentStateStatements(repo), `printf '%s\\n%s\\n' "$index_hash" "$worktree_tree"`].join(
        ' && ',
      )
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
    case 'gitCheckoutTracking':
      return remoteBranchCreationScript(
        `git -C ${shellQuote(command.path)} switch --track -c ${shellQuote(command.localBranch)} -- ${shellQuote(command.remoteRef)}`,
        command.path,
        command.localBranch,
        command.remoteRef,
      )
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
    case 'gitAlignToRemote': {
      const repo = shellQuote(command.path)
      const guard = [
        ...remoteWorktreeContentStateStatements(repo).map((statement, index) =>
          index === 0 ? `{ ${statement}` : statement,
        ),
        `current_branch=$(git -C ${repo} symbolic-ref --quiet --short HEAD)`,
        `current_head=$(git -C ${repo} rev-parse --verify 'HEAD^{commit}')`,
        `remote_head=$(git -C ${repo} rev-parse --verify ${shellQuote(`${command.remoteRef}^{commit}`)})`,
        `upstream=$(git -C ${repo} rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')`,
        `[ "$current_branch" = ${shellQuote(command.branch)} ]`,
        `[ "$current_head" = ${shellQuote(command.expectedHead)} ]`,
        `[ "$remote_head" = ${shellQuote(command.remoteHead)} ]`,
        `[ "$upstream" = ${shellQuote(command.remoteRef)} ]`,
        `[ "$index_hash" = ${shellQuote(command.expectedIndexHash)} ]`,
        `[ "$worktree_tree" = ${shellQuote(command.expectedWorktreeTree)} ]; }`,
      ].join(' && ')
      const changed = `{ printf '%s\\n' 'error.repository-changed' >&2; exit 1; }`
      const cleanFailed = `{ printf '%s\\n' 'error.align-remote-clean-incomplete' >&2; exit 1; }`
      return `${guard} || ${changed}; git -C ${repo} reset --hard ${shellQuote(command.remoteHead)} && { git -C ${repo} clean -fd || ${cleanFailed}; }`
    }
    case 'gitDiscardChanges':
      return remoteDiscardChangesScript(command)
    case 'gitBranchCreate':
      return remoteBranchCreationScript(
        `git -C ${shellQuote(command.path)} branch -- ${shellQuote(command.branch)} ${shellQuote(command.baseBranch)}`,
        command.path,
        command.branch,
        command.baseBranch,
      )
    case 'gitBranchTrackRemote':
      return remoteBranchCreationScript(
        `git -C ${shellQuote(command.path)} branch --track -- ${shellQuote(command.localBranch)} ${shellQuote(command.remoteRef)}`,
        command.path,
        command.localBranch,
        command.remoteRef,
      )
    case 'gitBranchSetUpstream':
      return command.remoteRef === null
        ? `git -C ${shellQuote(command.path)} branch --unset-upstream -- ${shellQuote(command.branch)}`
        : `git -C ${shellQuote(command.path)} branch --set-upstream-to=${shellQuote(command.remoteRef)} -- ${shellQuote(command.branch)}`
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
    case 'gitPushWorktreeHead':
      return `git -C ${shellQuote(command.path)} push -- ${shellQuote(command.remote)} ${shellQuote(
        `HEAD:refs/heads/${command.targetBranch}`,
      )}`
    case 'gitTags':
      return `git -C ${shellQuote(command.path)} tag --sort=-creatordate`
    case 'gitTagCreate':
      return `git -C ${shellQuote(command.path)} tag ${shellQuote(command.name)} ${shellQuote(command.ref)}`
    case 'gitTagDelete':
      return `git -C ${shellQuote(command.path)} tag -d ${shellQuote(command.name)}`
    case 'gitRemoteBranches':
      return `git -C ${shellQuote(command.path)} for-each-ref ${shellQuote('--format=%(refname:short)')} refs/remotes/`
    case 'gitRemoteBranchInfo':
      return `git -C ${shellQuote(command.path)} for-each-ref ${shellQuote(
        '--format=%(refname:short)%00%(objectname)',
      )} refs/remotes/`
    case 'gitRemoteTags':
      return `git -C ${shellQuote(command.path)} ls-remote --tags --refs ${shellQuote(command.remote)}`
    case 'gitRemoteBranchDelete':
      return `git -C ${shellQuote(command.path)} push --delete -- ${shellQuote(command.remote)} ${shellQuote(command.branch)}`
    case 'gitRemoteTagDelete':
      return `git -C ${shellQuote(command.path)} push -- ${shellQuote(command.remote)} ${shellQuote(
        `:refs/tags/${command.tag}`,
      )}`
    case 'gitTagPush':
      return `git -C ${shellQuote(command.path)} push -- ${shellQuote(command.remote)} ${shellQuote(`refs/tags/${command.tag}`)}`
    case 'gitWorktreeAdd': {
      const createScript = `git -C ${shellQuote(command.path)} worktree add ${remoteWorktreeAddArgs(command.input)}`
      if (command.input.mode.kind === 'newBranch') {
        return remoteBranchCreationScript(
          createScript,
          command.path,
          command.input.mode.newBranch,
          worktreeCreationBaseRef(command.input.mode.creationBase),
        )
      }
      if (command.input.mode.kind === 'trackRemoteBranch') {
        return remoteBranchCreationScript(
          createScript,
          command.path,
          command.input.mode.localBranch,
          command.input.mode.remoteRef,
        )
      }
      return createScript
    }
    case 'bootstrapRemoteWorktree':
      return remoteBootstrapScript(command)
    case 'gitWorktreeRemove':
      return `git -C ${shellQuote(command.path)} worktree remove ${command.force ? '--force ' : ''}-- ${shellQuote(command.worktreePath)}`
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

function remoteWorktreeContentStateStatements(repo: string): string[] {
  return [
    'tmp_dir=$(mktemp -d)',
    'tmp_index="$tmp_dir/index"',
    'tmp_entries="$tmp_dir/entries"',
    `trap 'rm -rf -- "$tmp_dir"' EXIT HUP INT TERM`,
    `git_dir=$(git -C ${repo} rev-parse --absolute-git-dir)`,
    `if [ -f "$git_dir/index" ]; then cp -- "$git_dir/index" "$tmp_index"; else rm -f -- "$tmp_index" && GIT_INDEX_FILE="$tmp_index" git -C ${repo} read-tree --empty; fi`,
    `GIT_INDEX_FILE="$tmp_index" git -C ${repo} ls-files --stage -z > "$tmp_entries"`,
    `index_hash=$(git -C ${repo} hash-object -- "$tmp_entries")`,
    `GIT_INDEX_FILE="$tmp_index" git -C ${repo} add -A -- .`,
    `worktree_tree=$(GIT_INDEX_FILE="$tmp_index" git -C ${repo} write-tree)`,
  ]
}

function tmuxListFunctionScript(): string[] {
  return [
    'run_tmux_list() {',
    '  tmux_output=$("$@" 2>&1)',
    '  tmux_status=$?',
    '  if [ "$tmux_status" -eq 0 ]; then',
    '    [ -z "$tmux_output" ] || printf \'%s\\n\' "$tmux_output"',
    '    return 0',
    '  fi',
    '  case "$tmux_output" in',
    '    *"\n"*) ;;',
    '    "no server running"|"no server running on "*|"failed to connect to server"|"failed to connect to server: No such file or directory"|"failed to connect to server: Connection refused"|"no sessions"|"error connecting to "*"(No such file or directory)") return 0 ;;',
    '  esac',
    '  printf \'%s\\n\' "$tmux_output" >&2',
    '  return "$tmux_status"',
    '}',
  ]
}

function tmuxListSessionsScript(projectRoot: string): string {
  const serverName = buildTmuxServerName(projectRoot)
  if (!serverName) throw new TypeError('error.invalid-arguments')
  return [
    'command -v tmux >/dev/null 2>&1 || exit 127',
    ...tmuxListFunctionScript(),
    `run_tmux_list tmux -L ${shellQuote(serverName)} -u list-sessions -F ${shellQuote(`${TMUX_SESSION_LIST_FORMAT}\t${serverName}`)} || exit $?`,
    `run_tmux_list tmux -u list-sessions -F ${shellQuote(`${TMUX_SESSION_LIST_FORMAT}\tlegacy-default`)} || exit $?`,
  ].join('\n')
}

function tmuxListHostSessionsScript(): string {
  const serverSuffixPattern = '[0-9a-f]'.repeat(24)
  return [
    'command -v tmux >/dev/null 2>&1 || exit 127',
    'LC_ALL=C',
    'export LC_ALL',
    ...tmuxListFunctionScript(),
    ...tmuxSocketDirectoryScript(),
    'if [ -d "$tmux_socket_dir" ]; then',
    '  for tmux_socket in "$tmux_socket_dir"/hobgoblin-project-v1-*; do',
    '    [ -S "$tmux_socket" ] || continue',
    '    tmux_server=${tmux_socket##*/}',
    '    case "$tmux_server" in',
    `      hobgoblin-project-v1-${serverSuffixPattern}) ;;`,
    '      *) continue ;;',
    '    esac',
    `    run_tmux_list tmux -S "$tmux_socket" -u list-sessions -F ${shellQuote(`${TMUX_HOST_SESSION_LIST_FORMAT}\t`)}"$tmux_server" || exit $?`,
    '  done',
    'fi',
    'tmux_default_socket="$tmux_socket_dir/default"',
    'if [ -S "$tmux_default_socket" ]; then',
    `  run_tmux_list tmux -S "$tmux_default_socket" -u list-sessions -F ${shellQuote(`${TMUX_HOST_SESSION_LIST_FORMAT}\tlegacy-default`)} || exit $?`,
    'fi',
  ].join('\n')
}

function tmuxSocketDirectoryScript(): string[] {
  return [
    'tmux_uid=$(id -u) || exit $?',
    'case "$tmux_uid" in ""|*[!0-9]*) exit 1 ;; esac',
    'tmux_socket_base=${TMUX_TMPDIR:-/tmp}',
    'case "$tmux_socket_base" in /*) ;; *) exit 1 ;; esac',
    'tmux_socket_dir="${tmux_socket_base%/}/tmux-$tmux_uid"',
  ]
}

type RemoteBranchWorkspaceCommand = Extract<
  RemoteCommandKind,
  {
    type:
      | 'listBranchWorkspaceCandidates'
      | 'inspectBranchWorkspacePath'
      | 'createBranchWorkspaceDirectory'
      | 'materializeBranchWorkspaceSymlink'
      | 'copyBranchWorkspaceEntry'
      | 'fingerprintBranchWorkspaceEntry'
      | 'removeBranchWorkspaceEntry'
      | 'listBranchWorkspaceChildren'
  }
>

function remoteBranchWorkspaceScript(command: RemoteBranchWorkspaceCommand): string {
  switch (command.type) {
    case 'listBranchWorkspaceCandidates':
      return remoteBranchWorkspacePython(command.rootPath, [
        `excluded_names = set(json.loads(${pythonString(JSON.stringify(command.excludedNames))}))`,
        `managed_prefixes = tuple(json.loads(${pythonString(JSON.stringify(BRANCH_WORKSPACE_DIRECTORY_PREFIXES))}))`,
        'managed_hidden_prefixes = tuple("." + prefix for prefix in managed_prefixes)',
        'root_real = os.path.realpath(root_path)',
        'excluded_worktrees = set()',
        'for repository_name in excluded_names:',
        '    repository_path = os.path.join(root_path, repository_name)',
        '    if not os.path.isdir(repository_path):',
        '        continue',
        '    try:',
        '        worktree_output = subprocess.check_output(["git", "-C", repository_path, "worktree", "list", "--porcelain"], stderr=subprocess.DEVNULL)',
        '    except (OSError, subprocess.CalledProcessError):',
        '        continue',
        '    for line in worktree_output.decode("utf-8", "surrogateescape").splitlines():',
        '        if line.startswith("worktree "):',
        '            excluded_worktrees.add(os.path.realpath(line[len("worktree "):]))',
        'candidates = []',
        'for name in sorted(os.listdir(root_path)):',
        '    if name in excluded_names or name.startswith(managed_prefixes) or name.startswith(managed_hidden_prefixes):',
        '        continue',
        '    candidate_path = os.path.join(root_path, name)',
        '    info = os.lstat(candidate_path)',
        '    resolved_path = os.path.realpath(candidate_path) if os.path.exists(candidate_path) else None',
        '    if resolved_path in excluded_worktrees:',
        '        continue',
        '    item = {',
        '        "name": name,',
        '        "path": candidate_path,',
        '        "kind": path_kind(info),',
        '        "outsideRoot": resolved_path is not None and not path_inside(root_real, resolved_path, True),',
        '    }',
        '    if resolved_path is not None:',
        '        item["resolvedPath"] = resolved_path',
        '    candidates.append(item)',
        'print(json.dumps({"ok": True, "candidates": candidates}, ensure_ascii=False))',
      ])
    case 'inspectBranchWorkspacePath':
      return remoteBranchWorkspacePython(command.rootPath, [
        `candidate_path = checked_path(${pythonString(command.candidatePath)}, True)`,
        'relative = os.path.relpath(candidate_path, root_path)',
        'direct_child = relative != "." and "/" not in relative',
        'if not os.path.lexists(candidate_path):',
        '    print(json.dumps({"ok": True, "inspection": {"path": candidate_path, "exists": False, "kind": "missing", "directChild": direct_child, "outsideRoot": False}}, ensure_ascii=False))',
        '    sys.exit(0)',
        'info = os.lstat(candidate_path)',
        'resolved_path = os.path.realpath(candidate_path) if os.path.exists(candidate_path) else None',
        'inspection = {',
        '    "path": candidate_path,',
        '    "exists": True,',
        '    "kind": path_kind(info),',
        '    "directChild": direct_child,',
        '    "outsideRoot": resolved_path is not None and not path_inside(os.path.realpath(root_path), resolved_path, True),',
        '}',
        'if stat.S_ISLNK(info.st_mode):',
        '    inspection["linkTarget"] = os.readlink(candidate_path)',
        'if resolved_path is not None:',
        '    inspection["resolvedPath"] = resolved_path',
        'print(json.dumps({"ok": True, "inspection": inspection}, ensure_ascii=False))',
      ])
    case 'createBranchWorkspaceDirectory':
      return remoteBranchWorkspacePython(command.rootPath, [
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        `managed_prefixes = tuple(json.loads(${pythonString(JSON.stringify(BRANCH_WORKSPACE_DIRECTORY_PREFIXES))}))`,
        'if os.path.dirname(target_path) != root_path or not os.path.basename(target_path).startswith(managed_prefixes):',
        '    fail("workspace.branch-workspace.invalid-path")',
        'ensure_safe_parents(target_path)',
        'os.mkdir(target_path)',
        'print(json.dumps({"ok": True}))',
      ])
    case 'materializeBranchWorkspaceSymlink':
      return remoteBranchWorkspacePython(command.rootPath, [
        `source_path = checked_path(${pythonString(command.sourcePath)}, False)`,
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        'if os.path.dirname(source_path) != root_path:',
        '    fail("workspace.branch-workspace.invalid-source")',
        'ensure_safe_parents(target_path)',
        'os.symlink(source_path, target_path)',
        'print(json.dumps({"ok": True}))',
      ])
    case 'copyBranchWorkspaceEntry':
      return remoteBranchWorkspacePython(command.rootPath, [
        `source_path = checked_path(${pythonString(command.sourcePath)}, False)`,
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        'if os.path.dirname(source_path) != root_path:',
        '    fail("workspace.branch-workspace.invalid-source")',
        'if not os.path.lexists(source_path):',
        '    fail("workspace.branch-workspace.source-missing")',
        'ensure_safe_parents(target_path)',
        'if os.path.lexists(target_path):',
        '    fail("workspace.branch-workspace.target-exists")',
        'copy_source = os.path.realpath(source_path) if os.path.islink(source_path) else source_path',
        'source_info = os.lstat(copy_source)',
        'if stat.S_ISDIR(source_info.st_mode):',
        '    shutil.copytree(copy_source, target_path, symlinks=True, copy_function=shutil.copy2)',
        'elif stat.S_ISREG(source_info.st_mode):',
        '    shutil.copy2(copy_source, target_path, follow_symlinks=False)',
        'else:',
        '    fail("workspace.branch-workspace.unsupported-entry")',
        'print(json.dumps({"ok": True}))',
      ])
    case 'fingerprintBranchWorkspaceEntry':
      return remoteBranchWorkspacePython(command.rootPath, [
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        'ensure_safe_parents(target_path)',
        'digest = hashlib.sha256()',
        'def hash_field(value):',
        '    data = value.encode("utf-8", "surrogateescape")',
        '    digest.update(str(len(data)).encode("ascii") + b":")',
        '    digest.update(data)',
        'def hash_entry(entry_path, relative_path):',
        '    info = os.lstat(entry_path)',
        '    kind = path_kind(info)',
        '    hash_field(relative_path)',
        '    hash_field(kind)',
        '    hash_field(str(info.st_mode & 0o7777))',
        '    if kind == "symlink":',
        '        hash_field(os.readlink(entry_path))',
        '        return',
        '    if kind == "file":',
        '        with open(entry_path, "rb") as handle:',
        '            while True:',
        '                chunk = handle.read(65536)',
        '                if not chunk:',
        '                    break',
        '                digest.update(chunk)',
        '        return',
        '    if kind != "directory":',
        '        return',
        '    for name in sorted(os.listdir(entry_path)):',
        '        child_relative = name if relative_path == "." else relative_path + "/" + name',
        '        hash_entry(os.path.join(entry_path, name), child_relative)',
        'hash_entry(target_path, ".")',
        'print(digest.hexdigest())',
      ])
    case 'removeBranchWorkspaceEntry':
      return remoteBranchWorkspacePython(command.rootPath, [
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        'ensure_safe_parents(target_path)',
        'def remove_no_follow(entry_path):',
        '    try:',
        '        info = os.lstat(entry_path)',
        '    except FileNotFoundError:',
        '        return',
        '    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):',
        '        os.unlink(entry_path)',
        '        return',
        '    for name in sorted(os.listdir(entry_path)):',
        '        remove_no_follow(os.path.join(entry_path, name))',
        '    os.rmdir(entry_path)',
        'remove_no_follow(target_path)',
        'print(json.dumps({"ok": True}))',
      ])
    case 'listBranchWorkspaceChildren':
      return remoteBranchWorkspacePython(command.rootPath, [
        `target_path = checked_path(${pythonString(command.targetPath)}, False)`,
        'ensure_safe_parents(target_path)',
        'info = os.lstat(target_path)',
        'if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):',
        '    fail("workspace.branch-workspace.not-directory")',
        'print(json.dumps({"ok": True, "children": sorted(os.listdir(target_path))}, ensure_ascii=False))',
      ])
  }
  const exhaustive: never = command
  return exhaustive
}

function remoteBranchWorkspacePython(rootPath: string, body: string[]): string {
  return [
    "python3 - <<'PY'",
    'import hashlib, json, os, shutil, stat, subprocess, sys',
    `root_path = os.path.normpath(${pythonString(rootPath)})`,
    'def fail(message):',
    '    print(json.dumps({"ok": False, "message": message}))',
    '    sys.exit(0)',
    'if not root_path or not os.path.isabs(root_path):',
    '    fail("workspace.branch-workspace.invalid-root")',
    'def path_inside(root, candidate, allow_root):',
    '    try:',
    '        common = os.path.commonpath([root, candidate])',
    '    except ValueError:',
    '        return False',
    '    return common == root and (allow_root or candidate != root)',
    'def checked_path(value, allow_root):',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate) or not path_inside(root_path, candidate, allow_root):',
    '        fail("workspace.branch-workspace.invalid-path")',
    '    return candidate',
    'def ensure_safe_parents(candidate):',
    '    relative = os.path.relpath(candidate, root_path)',
    '    current = root_path',
    '    for part in relative.split("/")[:-1]:',
    '        current = os.path.join(current, part)',
    '        try:',
    '            info = os.lstat(current)',
    '        except FileNotFoundError:',
    '            fail("workspace.branch-workspace.invalid-path")',
    '        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):',
    '            fail("workspace.branch-workspace.invalid-path")',
    'def path_kind(info):',
    '    if stat.S_ISLNK(info.st_mode): return "symlink"',
    '    if stat.S_ISDIR(info.st_mode): return "directory"',
    '    if stat.S_ISREG(info.st_mode): return "file"',
    '    return "other"',
    ...body,
    'PY',
  ].join('\n')
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

function remoteCreateFileTreeDirectoryScript(
  command: Extract<RemoteCommandKind, { type: 'createFileTreeDirectory' }>,
): string {
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

function remoteCreateFileTreeFileScript(command: Extract<RemoteCommandKind, { type: 'createFileTreeFile' }>): string {
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
    'try:',
    '    handle = open(target, "xb")',
    '    handle.close()',
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

function remoteCreateFileTreeTextFileScript(
  command: Extract<RemoteCommandKind, { type: 'createFileTreeTextFile' }>,
): string {
  const script = [
    ...remoteTextFilePreamble(command.worktreePath),
    `parent_dir = ${pythonString(command.parentDirPath)}`,
    `name = ${pythonString(command.name)}`,
    'if not isinstance(parent_dir, str) or not parent_dir or "\\x00" in parent_dir:',
    '    fail("error.invalid-arguments")',
    'parent_dir = os.path.normpath(parent_dir)',
    'if not os.path.isabs(parent_dir):',
    '    fail("error.invalid-arguments")',
    'if not inside_root(parent_dir):',
    '    fail("error.invalid-path")',
    'if not os.path.isdir(parent_dir):',
    '    fail("error.path-not-directory")',
    'if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\\x00" in name:',
    '    fail("error.invalid-arguments")',
    'target = os.path.normpath(os.path.join(parent_dir, name))',
    'if not inside_root(target):',
    '    fail("error.invalid-path")',
    'stdin_raw = sys.stdin.buffer.read()',
    'try:',
    '    next_raw = base64.b64decode(stdin_raw, validate=True)',
    'except Exception:',
    '    fail("error.invalid-arguments")',
    'decode_text(next_raw)',
    'try:',
    '    with open(target, "xb") as handle:',
    '        handle.write(next_raw)',
    'except FileExistsError:',
    '    fail("error.file-exists")',
    'except FileNotFoundError:',
    '    fail("error.path-not-found")',
    'except PermissionError:',
    '    fail("error.path-permission-denied")',
    'except OSError:',
    '    fail("error.failed-read-repo")',
    'finish({"ok": True, "message": ""})',
  ].join('\n')
  return `python3 -c ${shellQuote(script)}`
}

function remoteTextFilePreamble(worktreePath: string): string[] {
  return [
    '# FILE_TREE_TEXT_FILE_MAX_BYTES',
    'import base64, json, os, stat, sys',
    `root = ${pythonString(worktreePath)}`,
    `max_bytes = ${FILE_TREE_TEXT_FILE_MAX_BYTES}`,
    'root_real = os.path.normpath(root)',
    'def finish(payload):',
    '    print(json.dumps(payload, ensure_ascii=False))',
    '    sys.exit(0)',
    'def fail(message):',
    '    finish({"ok": False, "message": message})',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def checked_file_path(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        fail("error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        fail("error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        fail("error.invalid-path")',
    '    return candidate',
    'def decode_text(raw):',
    '    if len(raw) > max_bytes:',
    '        fail("error.file-tree-text-file-too-large")',
    '    try:',
    '        content = raw.decode("utf-8", "strict")',
    '    except UnicodeDecodeError:',
    '        fail("error.file-tree-binary-file")',
    '    if "\\x00" in content:',
    '        fail("error.file-tree-binary-file")',
    '    return content',
    'def read_text_file(path_value):',
    '    try:',
    '        info = os.lstat(path_value)',
    '    except FileNotFoundError:',
    '        fail("error.path-not-found")',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    if not stat.S_ISREG(info.st_mode):',
    '        fail("error.file-tree-not-regular-file")',
    '    if info.st_size > max_bytes:',
    '        fail("error.file-tree-text-file-too-large")',
    '    try:',
    '        with open(path_value, "rb") as handle:',
    '            raw = handle.read(max_bytes + 1)',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    except OSError:',
    '        fail("error.failed-read-repo")',
    '    content = decode_text(raw)',
    '    return content, len(raw)',
  ]
}

function remoteReadFileTreeTextFileScript(
  command: Extract<RemoteCommandKind, { type: 'readFileTreeTextFile' }>,
): string {
  return [
    "python3 - <<'PY'",
    ...remoteTextFilePreamble(command.worktreePath),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'content, byte_length = read_text_file(file_path)',
    'finish({"ok": True, "content": content, "byteLength": byte_length})',
    'PY',
  ].join('\n')
}

function remoteReplaceFileTreeTextFileScript(
  command: Extract<RemoteCommandKind, { type: 'replaceFileTreeTextFile' }>,
): string {
  const script = [
    ...remoteTextFilePreamble(command.worktreePath),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'stdin_raw = sys.stdin.buffer.read()',
    'try:',
    '    next_raw = base64.b64decode(stdin_raw, validate=True)',
    'except Exception:',
    '    fail("error.invalid-arguments")',
    'next_content = decode_text(next_raw)',
    'previous_content, previous_byte_length = read_text_file(file_path)',
    'try:',
    '    with open(file_path, "wb") as handle:',
    '        handle.write(next_raw)',
    'except PermissionError:',
    '    fail("error.path-permission-denied")',
    'except OSError:',
    '    fail("error.failed-read-repo")',
    'finish({"ok": True, "previousContent": previous_content, "previousByteLength": previous_byte_length})',
  ].join('\n')
  return `python3 -c ${shellQuote(script)}`
}

function normalizedRemoteMaxBytes(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}

function remoteBinaryFilePreamble(worktreePath: string, maxBytes: number): string[] {
  return [
    'import base64, json, os, stat, sys',
    `root = ${pythonString(worktreePath)}`,
    `max_bytes = ${normalizedRemoteMaxBytes(maxBytes)}`,
    'root_real = os.path.normpath(root)',
    'def finish(payload):',
    '    print(json.dumps(payload, ensure_ascii=False))',
    '    sys.exit(0)',
    'def fail(message):',
    '    finish({"ok": False, "message": message})',
    'def inside_root(value):',
    '    candidate = os.path.normpath(value)',
    "    return candidate == root_real or candidate.startswith(root_real.rstrip('/') + '/')",
    'def checked_file_path(value):',
    '    if not isinstance(value, str) or not value or "\\x00" in value:',
    '        fail("error.invalid-arguments")',
    '    candidate = os.path.normpath(value)',
    '    if not os.path.isabs(candidate):',
    '        fail("error.invalid-arguments")',
    '    if not inside_root(candidate):',
    '        fail("error.invalid-path")',
    '    return candidate',
    'def read_binary_file(path_value):',
    '    try:',
    '        info = os.lstat(path_value)',
    '    except FileNotFoundError:',
    '        fail("error.path-not-found")',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    if not stat.S_ISREG(info.st_mode):',
    '        fail("error.file-tree-not-regular-file")',
    '    if info.st_size > max_bytes:',
    '        fail("error.file-tree-clipboard-file-too-large")',
    '    try:',
    '        with open(path_value, "rb") as handle:',
    '            raw = handle.read(max_bytes + 1)',
    '    except PermissionError:',
    '        fail("error.path-permission-denied")',
    '    except OSError:',
    '        fail("error.failed-read-repo")',
    '    if len(raw) > max_bytes:',
    '        fail("error.file-tree-clipboard-file-too-large")',
    '    return raw',
  ]
}

function remoteReadFileTreeBinaryFileScript(
  command: Extract<RemoteCommandKind, { type: 'readFileTreeBinaryFile' }>,
): string {
  return [
    "python3 - <<'PY'",
    ...remoteBinaryFilePreamble(command.worktreePath, command.maxBytes),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'raw = read_binary_file(file_path)',
    'payload = {"ok": True, "name": os.path.basename(file_path), "byteLength": len(raw), "bytesBase64": base64.b64encode(raw).decode("ascii")}',
    'try:',
    '    text = raw.decode("utf-8", "strict")',
    '    if "\\x00" not in text:',
    '        payload["text"] = text',
    'except UnicodeDecodeError:',
    '    pass',
    'finish(payload)',
    'PY',
  ].join('\n')
}

function remoteReplaceFileTreeBinaryFileScript(
  command: Extract<RemoteCommandKind, { type: 'replaceFileTreeBinaryFile' }>,
): string {
  const script = [
    ...remoteBinaryFilePreamble(command.worktreePath, command.maxBytes),
    `file_path = checked_file_path(${pythonString(command.filePath)})`,
    'stdin_raw = sys.stdin.buffer.read()',
    'try:',
    '    next_raw = base64.b64decode(stdin_raw, validate=True)',
    'except Exception:',
    '    fail("error.invalid-arguments")',
    'if len(next_raw) > max_bytes:',
    '    fail("error.file-tree-clipboard-file-too-large")',
    'previous_raw = read_binary_file(file_path)',
    'try:',
    '    with open(file_path, "wb") as handle:',
    '        handle.write(next_raw)',
    'except PermissionError:',
    '    fail("error.path-permission-denied")',
    'except OSError:',
    '    fail("error.failed-read-repo")',
    'finish({"ok": True, "previousBytesBase64": base64.b64encode(previous_raw).decode("ascii"), "previousByteLength": len(previous_raw)})',
  ].join('\n')
  return `python3 -c ${shellQuote(script)}`
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

function remoteBranchCreationScript(
  createScript: string,
  repoPath: string,
  branch: string,
  createdFrom: string,
): string {
  const configScript = [
    'git',
    '-C',
    shellQuote(repoPath),
    'config',
    '--local',
    shellQuote(branchCreatedFromConfigKey(branch)),
    shellQuote(createdFrom),
  ].join(' ')
  return `${createScript} && { ${configScript} || true; }`
}

function remoteWorktreeAddArgs(input: CreateWorktreeInput): string {
  switch (input.mode.kind) {
    case 'newBranch':
      return [
        '-b',
        shellQuote(input.mode.newBranch),
        '--',
        shellQuote(input.worktreePath),
        shellQuote(worktreeCreationBaseRef(input.mode.creationBase)),
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

function remoteBootstrapScript(command: Extract<RemoteCommandKind, { type: 'bootstrapRemoteWorktree' }>): string {
  const inner = remoteBootstrapInnerScript(command)
  const quoted = shellQuote(inner)
  return [
    'command -v bash >/dev/null 2>&1 || { printf "%s\\n" "error: bash is required for worktree bootstrap" >&2; exit 1; }',
    `exec bash -c ${quoted}`,
  ].join('\n')
}

function remoteBootstrapInnerScript(command: Extract<RemoteCommandKind, { type: 'bootstrapRemoteWorktree' }>): string {
  const items = [...command.copy.map((rel) => `copy\t${rel}`), ...command.symlink.map((rel) => `symlink\t${rel}`)]
    .map(shellQuote)
    .join(' ')
  return [
    'set -o pipefail',
    `SOURCE_ROOT=${shellQuote(command.sourceRoot)}`,
    `TARGET_ROOT=${shellQuote(command.targetRoot)}`,
    `ITEMS=(${items})`,
    '',
    'path_exists() {',
    '  [ -e "$1" ] || [ -L "$1" ]',
    '}',
    '',
    'valid_rel() {',
    '  local rel="$1"',
    '  [ -n "$rel" ] || return 1',
    '  [[ "$rel" =~ [[:cntrl:]] ]] && return 1',
    '  case "$rel" in',
    '    "."|/*|*\\\\*|".."|../*|*/..|*/../*|".git"|.git/*|*/.git|*/.git/*) return 1 ;;',
    '    */./*|./*|*/.|*//*) return 1 ;;',
    '  esac',
    '  return 0',
    '}',
    '',
    'parent_has_symlink() {',
    '  local root="$1" rel="$2" current segment i',
    '  local -a parts',
    '  IFS=/ read -r -a parts <<< "$rel"',
    '  current="$root"',
    '  for ((i = 0; i < ${#parts[@]} - 1; i += 1)); do',
    '    segment="${parts[$i]}"',
    '    [ -n "$segment" ] || return 0',
    '    current="$current/$segment"',
    '    [ -L "$current" ] && return 0',
    '  done',
    '  return 1',
    '}',
    '',
    'materialize_item() {',
    '  local mode="$1" rel="$2" src dst parent tracked temp prepared marker',
    '  valid_rel "$rel" || return 1',
    '  tracked="$(mktemp "${TMPDIR:-/tmp}/goblin-bootstrap-tracked.XXXXXX")" || return 1',
    '  if ! git -C "$SOURCE_ROOT" ls-files -z -- "$rel" >"$tracked" 2>/dev/null; then',
    '    rm -f -- "$tracked"',
    '    return 1',
    '  fi',
    '  if [ -s "$tracked" ]; then rm -f -- "$tracked"; return 1; fi',
    '  rm -f -- "$tracked"',
    '  src="$SOURCE_ROOT/$rel"',
    '  dst="$TARGET_ROOT/$rel"',
    '  [ ! -L "$src" ] && { [ -f "$src" ] || [ -d "$src" ]; } || return 1',
    '  parent_has_symlink "$SOURCE_ROOT" "$rel" && return 1',
    '  parent_has_symlink "$TARGET_ROOT" "$rel" && return 1',
    '  path_exists "$dst" && return 1',
    '  parent="$(dirname "$dst")"',
    '  mkdir -p -- "$parent" 2>/dev/null || return 1',
    '  parent_has_symlink "$TARGET_ROOT" "$rel" && return 1',
    '  path_exists "$dst" && return 1',
    '  case "$mode" in',
    '    copy)',
    '      temp="$(mktemp -d "$parent/.goblin-bootstrap.XXXXXX")" || return 1',
    '      prepared="$temp/item"',
    '      if ! cp -RP -- "$src" "$prepared" 2>/dev/null; then rm -rf -- "$temp"; return 1; fi',
    '      if parent_has_symlink "$TARGET_ROOT" "$rel" || path_exists "$dst"; then',
    '        rm -rf -- "$temp"',
    '        return 1',
    '      fi',
    '      if ! mv -- "$prepared" "$dst" 2>/dev/null; then rm -rf -- "$temp"; return 1; fi',
    '      rm -rf -- "$temp"',
    '      marker=COPY',
    '      ;;',
    '    symlink)',
    '      ln -s -- "$src" "$dst" 2>/dev/null || return 1',
    '      marker=SYMLINK',
    '      ;;',
    '    *) return 1 ;;',
    '  esac',
    '  printf \'GOBLIN_BOOTSTRAP_%s\\0%s\\0\' "$marker" "$rel"',
    '}',
    '',
    'if [ ! -d "$SOURCE_ROOT" ] || [ -L "$SOURCE_ROOT" ] || [ ! -d "$TARGET_ROOT" ] || [ -L "$TARGET_ROOT" ]; then',
    '  exit 0',
    'fi',
    'for item in "${ITEMS[@]}"; do',
    '  case "$item" in *$\'\\t\'*) ;; *) continue ;; esac',
    '  mode="${item%%$\'\\t\'*}"',
    '  rel="${item#*$\'\\t\'}"',
    '  materialize_item "$mode" "$rel" || true',
    'done',
  ].join('\n')
}
