import path from 'node:path'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoId,
  parseRemoteRepoId,
  type RemoteRepoTarget,
} from '#/shared/remote-repo.ts'
import { windowsPathIdentityKey } from '#/shared/path-semantics.ts'
import { parseTerminalIdIndex } from '#/shared/terminal.ts'
import { terminalSessionScope } from '#/server/terminal/terminal-scope.ts'
import { buildRemoteTerminalInvocation } from '#/system/ssh/commands.ts'
import {
  buildExistingTmuxAttachShellCommand,
  buildRequiredTmuxShellScript,
  buildTmuxServerName,
} from '#/system/tmux-session.ts'

export interface TerminalPathRelocationInput {
  rootId: string
  branchWorkspaceId: string
  previousPath: string
  path: string
}

export interface TerminalPathRelocationResult {
  relocated: Array<{ sessionId: string; previousKey: string; key: string; previousScope: string; scope: string }>
  scopes: string[]
}

export interface TerminalSessionLocation {
  scope: string
  key: string
  cwd: string
  command?: string
  args?: string[]
  tmuxSessionName: string | null
  tmuxWorkingDirectory: string | null
  /** The tmux server/metadata identity survives a later directory relocation. */
  tmuxProjectRoot: string | null
  cols: number
  rows: number
}

export type TerminalSessionLocationUpdate = Pick<TerminalSessionLocation, 'scope' | 'key' | 'cwd' | 'command' | 'args'>

export function validateTerminalPathRelocation(input: TerminalPathRelocationInput): void {
  if (
    !input ||
    !isValidRepoLocator(input.rootId) ||
    !input.branchWorkspaceId?.trim() ||
    !isValidCwd(input.previousPath) ||
    !isValidCwd(input.path)
  )
    throw new Error('error.invalid-arguments')
  const remote = parseRemoteRepoId(input.rootId)
  const paths = remote ? path.posix : windowsPathIdentityKey(input.previousPath) ? path.win32 : path
  if (
    !paths.isAbsolute(input.previousPath) ||
    !paths.isAbsolute(input.path) ||
    paths.parse(input.previousPath).root === paths.normalize(input.previousPath) ||
    paths.parse(input.path).root === paths.normalize(input.path)
  )
    throw new Error('error.invalid-arguments')
}

/** Only rewrites server metadata and future launch arguments, never live shell input. */
export function createTerminalPathRelocator(input: TerminalPathRelocationInput, target?: RemoteRepoTarget) {
  validateTerminalPathRelocation(input)
  const host = parseRemoteRepoId(input.rootId)
  const paths = host ? path.posix : windowsPathIdentityKey(input.previousPath) ? path.win32 : path
  const previousPath = paths.resolve(input.previousPath)
  const destinationPath = paths.resolve(input.path)

  function relocatePath(value: string): string {
    const relative = paths.relative(previousPath, value)
    if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) return value
    return paths.join(destinationPath, relative)
  }

  return (session: Readonly<TerminalSessionLocation>): TerminalSessionLocationUpdate | null => {
    const ref = parseRemoteRepoId(session.scope)
    if (host ? !ref || ref.alias !== host.alias || ref.transport !== host.transport : isRemoteRepoId(session.scope))
      return null
    const parts = session.key.split('\0')
    if (parts.length !== 3 || parts[0] !== session.scope) return null
    const [repoRoot, worktreePath, terminalId] = parts as [string, string, string]
    const newWorktreePath = relocatePath(worktreePath)
    const newRepoRoot = ref
      ? normalizeRemoteRepoId({ ...ref, remotePath: relocatePath(ref.remotePath) })
      : terminalSessionScope(relocatePath(repoRoot))
    const normalizedWorktreePath = host ? newWorktreePath : terminalSessionScope(newWorktreePath)
    if (newRepoRoot === repoRoot && normalizedWorktreePath === worktreePath) return null
    const update: TerminalSessionLocationUpdate = {
      scope: newRepoRoot,
      key: `${newRepoRoot}\0${normalizedWorktreePath}\0${terminalId}`,
      cwd: host ? session.cwd : relocatePath(session.cwd),
      command: session.command,
      args: session.args,
    }
    const terminalNumber = parseTerminalIdIndex(terminalId)
    if (host) {
      if (!target || terminalNumber === null || target.alias !== host.alias || target.transport !== host.transport)
        throw new Error('error.ssh-config-changed')
      const nextRef = parseRemoteRepoId(newRepoRoot)!
      const invocation = buildRemoteTerminalInvocation({ ...target, remotePath: nextRef.remotePath }, newWorktreePath, {
        cols: session.cols,
        rows: session.rows,
        terminalNumber,
      })
      update.command = invocation.command
      update.args = invocation.args
    }
    if (session.tmuxSessionName) {
      const projectRoot = session.tmuxProjectRoot ?? session.scope
      const tmuxRoot = parseRemoteRepoId(projectRoot)?.remotePath ?? projectRoot
      const serverName = buildTmuxServerName(tmuxRoot)
      const projectAttach = serverName
        ? buildExistingTmuxAttachShellCommand({ kind: 'hobgoblin', sessionName: session.tmuxSessionName, serverName })
        : null
      const legacyAttach = buildExistingTmuxAttachShellCommand({
        kind: 'hobgoblin',
        sessionName: session.tmuxSessionName,
      })
      if (!projectAttach || !legacyAttach || !serverName) throw new Error('error.invalid-arguments')
      // Existing sessions may be on the project socket or the older default socket.
      // Keep that identity and only attach; a rename must never create another tmux session.
      const attach = `if tmux -L ${shellQuote(serverName)} has-session -t ${shellQuote(`=${session.tmuxSessionName}`)} 2>/dev/null; then\n${projectAttach.command}\nelse\n${legacyAttach.command}\nfi`
      const script = buildRequiredTmuxShellScript(newWorktreePath, attach)
      if (!script) throw new Error('error.invalid-arguments')
      if (host) {
        if (!target || !update.args) throw new Error('error.ssh-config-changed')
        update.args = [
          ...update.args.slice(0, -1),
          target.transport === 'wsl' ? script : `sh -lc ${shellQuote(script)}`,
        ]
      } else {
        update.args = ['-lc', script]
      }
    }
    return update
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
