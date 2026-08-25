import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, test } from 'vitest'
import { buildRemoteCommandInvocation, buildRemoteTerminalInvocation } from '#/system/ssh/commands.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
})!
const MACOS_MISSING_TMUX_SERVER_MESSAGE =
  'error connecting to /private/tmp/tmux-501/default (No such file or directory)'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function testPosix(name: string, fn: () => Promise<void> | void): void {
  if (process.platform === 'win32') test.skip(name, fn)
  else test(name, fn)
}

describe('remote command scripts', () => {
  test('runs repository commands and internal terminals inside the selected WSL distribution', () => {
    const target = normalizeRemoteTarget({
      transport: 'wsl',
      alias: 'Ubuntu',
      host: 'Ubuntu',
      user: 'wsl',
      port: 22,
      remotePath: '/root/src/repo',
      wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
    })!
    const command = buildRemoteCommandInvocation(target, { type: 'gitStatus', path: '/root/src/repo' })
    const terminal = buildRemoteTerminalInvocation(target, '/root/src/repo', {
      cols: 120,
      rows: 40,
      terminalNumber: 1,
    })

    expect(command.command).toBe('C:\\Windows\\System32\\wsl.exe')
    expect(command.args.slice(0, 5)).toEqual(['--distribution', 'Ubuntu', '--exec', 'sh', '-lc'])
    expect(command.args[5]).toBe(command.script)
    expect(terminal.command).toBe('C:\\Windows\\System32\\wsl.exe')
    expect(terminal.args.slice(0, 5)).toEqual(['--distribution', 'Ubuntu', '--exec', 'sh', '-lc'])
    expect(terminal.script).toContain("cd '/root/src/repo' || exit")
  })

  test('builds tmux list, kill, and copy-mode cancellation commands without session ids', () => {
    const serverName = 'hobgoblin-project-v1-44159cd9e973adba7b472e6f'
    const list = buildRemoteCommandInvocation(TARGET, { type: 'tmuxListSessions', projectRoot: '/srv/repo' })
    const killByName = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxKillSessionByName',
      projectRoot: '/srv/repo',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
    })
    const cancelModeByName = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxCancelModeBySessionName',
      projectRoot: '/srv/repo',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
    })
    const pageUpByName = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxPageBySessionName',
      projectRoot: '/srv/repo',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
      direction: 'up',
    } as Parameters<typeof buildRemoteCommandInvocation>[1])
    const pageDownByName = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxPageBySessionName',
      projectRoot: '/srv/repo',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
      direction: 'down',
    } as Parameters<typeof buildRemoteCommandInvocation>[1])

    expect(list.script).toContain(`tmux -L '${serverName}' -u list-sessions`)
    expect(list.script).toContain(`#{session_name}\t${serverName}`)
    expect(list.script).toContain('tmux -u list-sessions')
    expect(list.script).toContain('#{session_name}\tlegacy-default')
    expect(killByName.script).toBe(
      "command -v tmux >/dev/null 2>&1 || exit 127\ntmux -L 'hobgoblin-project-v1-44159cd9e973adba7b472e6f' kill-session -t '=hobgoblin-v1-aebf050981ac829e36100020'",
    )
    expect(cancelModeByName.script).toBe(
      "command -v tmux >/dev/null 2>&1 || exit 127\ntmux -L 'hobgoblin-project-v1-44159cd9e973adba7b472e6f' copy-mode -q -t '=hobgoblin-v1-aebf050981ac829e36100020:'",
    )
    expect(pageUpByName.script).toBe(
      "command -v tmux >/dev/null 2>&1 || exit 127\ntmux -L 'hobgoblin-project-v1-44159cd9e973adba7b472e6f' copy-mode -eu -t '=hobgoblin-v1-aebf050981ac829e36100020:'",
    )
    expect(pageDownByName.script).toBe(
      "command -v tmux >/dev/null 2>&1 || exit 127\ntmux -L 'hobgoblin-project-v1-44159cd9e973adba7b472e6f' copy-mode -ed -t '=hobgoblin-v1-aebf050981ac829e36100020:'",
    )
  })

  test('rejects an invalid tmux copy-mode page direction', () => {
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxPageBySessionName',
        projectRoot: '/srv/repo',
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        direction: 'sideways',
      } as unknown as Parameters<typeof buildRemoteCommandInvocation>[1]),
    ).toThrow('error.invalid-arguments')
  })

  test('builds a fixed host-wide tmux inventory and exact-origin kill command', () => {
    const serverName = 'hobgoblin-project-v1-44159cd9e973adba7b472e6f'
    const hostList = buildRemoteCommandInvocation(TARGET, { type: 'tmuxListHostSessions' } as Parameters<
      typeof buildRemoteCommandInvocation
    >[1])
    const hostKill = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxKillHostSessionByName',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
    } as Parameters<typeof buildRemoteCommandInvocation>[1])
    const defaultHostKill = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxKillHostSessionByName',
      sessionName: "editor's work",
    } as Parameters<typeof buildRemoteCommandInvocation>[1])

    expect(hostList.script).toContain('tmux_uid=$(id -u)')
    expect(hostList.script).toContain('tmux_socket_base=${TMUX_TMPDIR:-/tmp}')
    expect(hostList.script).toContain('"$tmux_socket_dir"/hobgoblin-project-v1-*')
    expect(hostList.script).toContain('tmux -S "$tmux_socket" -u list-sessions')
    expect(hostList.script).toContain('#{session_path}')
    expect(hostList.script).not.toContain('#{@hobgoblin_project_root}')
    expect(hostList.script).toContain('"$tmux_server"')
    expect(hostList.script).toContain('tmux_default_socket="$tmux_socket_dir/default"')
    expect(hostList.script).toContain('tmux -S "$tmux_default_socket" -u list-sessions')
    expect(hostList.script).toContain('legacy-default')
    expect(hostList.script).toContain('"error connecting to "*"(No such file or directory)"')
    expect(hostKill.script).toContain('tmux_uid=$(id -u)')
    expect(hostKill.script).toContain('tmux_socket="$tmux_socket_dir/hobgoblin-project-v1-44159cd9e973adba7b472e6f"')
    expect(hostKill.script).toContain(
      'tmux -S "$tmux_socket" kill-session -t \'=hobgoblin-v1-aebf050981ac829e36100020\'',
    )
    expect(defaultHostKill.script).toContain('tmux_socket="$tmux_socket_dir/default"')
    expect(defaultHostKill.script).toContain("kill-session -t '=editor'\\''s work'")
  })

  test('rejects unsafe host-wide tmux kill targets before building an SSH invocation', () => {
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxKillHostSessionByName',
        sessionName: 'unsafe\nname',
      } as Parameters<typeof buildRemoteCommandInvocation>[1]),
    ).toThrow('error.invalid-arguments')
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxKillHostSessionByName',
        sessionName: 'editor',
        serverName: 'hobgoblin-project-v1-44159cd9e973adba7b472e6f',
      } as Parameters<typeof buildRemoteCommandInvocation>[1]),
    ).toThrow('error.invalid-arguments')
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxKillHostSessionByName',
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        serverName: 'user-server',
      } as Parameters<typeof buildRemoteCommandInvocation>[1]),
    ).toThrow('error.invalid-arguments')
  })

  testPosix('treats absent tmux servers as empty without masking project server failures', async () => {
    const directory = path.join(os.tmpdir(), `hobgoblin-tmux-list-${Date.now()}-${process.pid}`)
    const fakeBin = path.join(directory, 'bin')
    tempDirs.push(directory)
    mkdirSync(fakeBin, { recursive: true })
    const tmuxPath = path.join(fakeBin, 'tmux')
    writeFileSync(
      tmuxPath,
      [
        '#!/bin/sh',
        'if [ "$1" = "-L" ]; then',
        '  printf \'%s\\n\' "${FAKE_PROJECT_MESSAGE:-no server running}" >&2',
        '  exit "${FAKE_PROJECT_STATUS:-1}"',
        'fi',
        'printf \'%s\\n\' "${FAKE_LEGACY_MESSAGE:-no server running}" >&2',
        'exit "${FAKE_LEGACY_STATUS:-1}"',
      ].join('\n'),
    )
    chmodSync(tmuxPath, 0o755)
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxListSessions',
      projectRoot: '/srv/repo',
    })
    const environment = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` }

    const absent = await execa('sh', ['-c', invocation.script], { env: environment, reject: false })
    const macosAbsent = await execa('sh', ['-c', invocation.script], {
      env: {
        ...environment,
        FAKE_PROJECT_MESSAGE: MACOS_MISSING_TMUX_SERVER_MESSAGE,
        FAKE_LEGACY_MESSAGE: MACOS_MISSING_TMUX_SERVER_MESSAGE,
      },
      reject: false,
    })
    const macosSuffixedFailure = `${MACOS_MISSING_TMUX_SERVER_MESSAGE}: permission denied`
    const suffixed = await execa('sh', ['-c', invocation.script], {
      env: { ...environment, FAKE_PROJECT_MESSAGE: macosSuffixedFailure },
      reject: false,
    })
    const macosMultilineFailure = `${MACOS_MISSING_TMUX_SERVER_MESSAGE}\npermission denied`
    const multiline = await execa('sh', ['-c', invocation.script], {
      env: { ...environment, FAKE_PROJECT_MESSAGE: macosMultilineFailure },
      reject: false,
    })
    const failed = await execa('sh', ['-c', invocation.script], {
      env: { ...environment, FAKE_PROJECT_MESSAGE: 'permission denied', FAKE_PROJECT_STATUS: '2' },
      reject: false,
    })

    expect(absent.exitCode).toBe(0)
    expect(absent.stdout).toBe('')
    expect(absent.stderr).toBe('')
    expect(macosAbsent.exitCode).toBe(0)
    expect(macosAbsent.stdout).toBe('')
    expect(macosAbsent.stderr).toBe('')
    expect(suffixed.exitCode).toBe(1)
    expect(suffixed.stderr).toBe(macosSuffixedFailure)
    expect(multiline.exitCode).toBe(1)
    expect(multiline.stderr).toBe(macosMultilineFailure)
    expect(failed.exitCode).toBe(2)
    expect(failed.stderr).toBe('permission denied')
  })

  test('rejects invalid tmux session names before building an SSH invocation', () => {
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxKillSessionByName',
        projectRoot: '/srv/repo',
        sessionName: 'hobgoblin-v1-bad; touch /tmp/example',
      }),
    ).toThrow('error.invalid-arguments')
    expect(() =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'tmuxKillSessionByName',
        projectRoot: '/srv/repo',
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
      }),
    ).toThrow('error.invalid-arguments')
  })

  test('requests immediate expiry annotations when listing worktrees', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeList',
      path: '/srv/repo',
    })

    expect(invocation.script).toBe("git -C '/srv/repo' worktree list --porcelain --expire now")
  })

  test('includes branch creation sources in remote Git snapshots', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitSnapshot',
      path: '/srv/repo',
    })

    expect(invocation.script).toContain('__HOBGOBLIN_REMOTE_BRANCH_CREATED_FROM__')
    expect(invocation.script).toContain("config --local --get-regexp '^branch\\..*\\.hobgoblin-created-from$'")
    expect(invocation.script).toContain('|| true')
    expect(invocation.script.trimEnd()).toMatch(/for-each-ref .* refs\/heads\/$/)
  })

  test('prunes immediately expired remote worktree records', () => {
    let invocation: ReturnType<typeof buildRemoteCommandInvocation> | undefined
    expect(() => {
      invocation = buildRemoteCommandInvocation(TARGET, {
        type: 'gitWorktreePrune',
        path: '/srv/repo',
      })
    }).not.toThrow()

    expect(invocation?.script).toBe("git -C '/srv/repo' worktree prune --expire now")
  })

  test('adds one force flag only to explicitly forced worktree removal commands', () => {
    const safe = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeRemove',
      path: '/srv/repo',
      worktreePath: '/srv/repo-feature',
    })
    const forced = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeRemove',
      path: '/srv/repo',
      worktreePath: '/srv/repo-feature',
      force: true,
    })

    expect(safe.script).toContain("worktree remove -- '/srv/repo-feature'")
    expect(safe.script).not.toContain('worktree remove --force')
    expect(forced.script).toContain("worktree remove --force -- '/srv/repo-feature'")
    expect(forced.script).not.toContain('worktree remove --force --force')
  })

  test('builds fixed branch workspace inspect and list commands with JSON encoded paths', () => {
    const inspect = buildRemoteCommandInvocation(TARGET, {
      type: 'inspectBranchWorkspacePath',
      rootPath: '/srv/workspace',
      candidatePath: "/srv/workspace/user's docs",
    })
    expect(inspect.script).toContain('python3')
    expect(inspect.script).toContain('os.lstat')
    expect(inspect.script).toContain('os.path.realpath')
    expect(inspect.script).toContain("user's docs")

    const list = buildRemoteCommandInvocation(TARGET, {
      type: 'listBranchWorkspaceCandidates',
      rootPath: '/srv/workspace',
      excludedNames: ['api', "team's repo"],
    })
    expect(list.script).toContain('os.listdir')
    expect(list.script).toContain('excluded_names')
    expect(list.script).toContain("team's repo")
    expect(list.script).toContain('\\"hob-\\"')
    expect(list.script).toContain('\\"hobgoblin-\\"')
    expect(list.script).toContain('managed_hidden_prefixes = tuple("." + prefix for prefix in managed_prefixes)')

    const create = buildRemoteCommandInvocation(TARGET, {
      type: 'createBranchWorkspaceDirectory',
      rootPath: '/srv/workspace',
      targetPath: '/srv/workspace/hob-feature',
    })
    expect(create.script).toContain('\\"hob-\\"')
    expect(create.script).toContain('\\"hobgoblin-\\"')
  })

  test('builds fixed branch workspace copy and fingerprint commands', () => {
    const copy = buildRemoteCommandInvocation(TARGET, {
      type: 'copyBranchWorkspaceEntry',
      rootPath: '/srv/workspace',
      sourcePath: '/srv/workspace/shared',
      targetPath: '/srv/workspace/goblin-feature/shared',
    })
    expect(copy.script).toContain('shutil.copytree')
    expect(copy.script).toContain('symlinks=True')
    expect(copy.script).toContain('os.path.realpath(source_path)')

    const fingerprint = buildRemoteCommandInvocation(TARGET, {
      type: 'fingerprintBranchWorkspaceEntry',
      rootPath: '/srv/workspace',
      targetPath: '/srv/workspace/goblin-feature/shared',
    })
    expect(fingerprint.script).toContain('hashlib.sha256')
    expect(fingerprint.script).toContain('os.readlink')
    expect(fingerprint.script).toContain('os.lstat')
  })

  test('builds a no-follow branch workspace removal command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'removeBranchWorkspaceEntry',
      rootPath: '/srv/workspace',
      targetPath: '/srv/workspace/goblin-feature/shared',
    })
    expect(invocation.script).toContain('os.lstat')
    expect(invocation.script).toContain('os.unlink')
    expect(invocation.script).not.toContain('os.path.realpath(target_path)')
  })

  testPosix('executes branch workspace copy, fingerprint, and no-follow removal scripts', async () => {
    const directory = path.join(os.tmpdir(), `hobgoblin-remote-branch-workspace-${Date.now()}-${process.pid}`)
    tempDirs.push(directory)
    const root = path.join(directory, 'workspace')
    const source = path.join(root, 'docs')
    const branchRoot = path.join(root, 'hob-feature')
    const copied = path.join(branchRoot, 'docs')
    mkdirSync(source, { recursive: true })
    writeFileSync(path.join(source, 'guide.md'), 'guide')
    symlinkSync('guide.md', path.join(source, 'guide-link'))

    await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'createBranchWorkspaceDirectory',
        rootPath: root,
        targetPath: branchRoot,
      }).script,
    ])
    await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'copyBranchWorkspaceEntry',
        rootPath: root,
        sourcePath: source,
        targetPath: copied,
      }).script,
    ])

    expect(readFileSync(path.join(copied, 'guide.md'), 'utf8')).toBe('guide')
    expect(lstatSync(path.join(copied, 'guide-link')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path.join(copied, 'guide-link'))).toBe('guide.md')

    const fingerprint = await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'fingerprintBranchWorkspaceEntry',
        rootPath: root,
        targetPath: copied,
      }).script,
    ])
    expect(fingerprint.stdout).toMatch(/^[a-f0-9]{64}$/)

    const managedLink = path.join(branchRoot, 'README.md')
    const sourceFile = path.join(root, 'README.md')
    writeFileSync(sourceFile, 'keep')
    await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'materializeBranchWorkspaceSymlink',
        rootPath: root,
        sourcePath: sourceFile,
        targetPath: managedLink,
      }).script,
    ])
    await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'removeBranchWorkspaceEntry',
        rootPath: root,
        targetPath: managedLink,
      }).script,
    ])
    expect(existsSync(managedLink)).toBe(false)
    expect(readFileSync(sourceFile, 'utf8')).toBe('keep')

    const missingSource = path.join(root, 'missing.env')
    const danglingLink = path.join(branchRoot, 'missing.env')
    await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'materializeBranchWorkspaceSymlink',
        rootPath: root,
        sourcePath: missingSource,
        targetPath: danglingLink,
      }).script,
    ])
    expect(readlinkSync(danglingLink)).toBe(missingSource)
  })

  test('builds depth-one workspace marker discovery and path existence commands', () => {
    const discovery = buildRemoteCommandInvocation(TARGET, {
      type: 'listWorkspaceGitDirectories',
      rootPath: '/srv/workspace',
    })
    expect(discovery.script).toContain('-mindepth 1')
    expect(discovery.script).toContain('-maxdepth 1')
    expect(discovery.script).toContain('-type l')
    expect(discovery.script).toContain('.git')
    expect(discovery.script).toContain('printf "%s\\0"')

    const validation = buildRemoteCommandInvocation(TARGET, {
      type: 'testWorkspaceGitDirectory',
      path: '/srv/workspace/linked',
    })
    expect(validation.script).toContain('pwd -P')
    expect(validation.script).toContain('rev-parse --show-toplevel')

    const exists = buildRemoteCommandInvocation(TARGET, { type: 'testPathExists', path: '/srv/worktree' })
    expect(exists.script).toContain("test -e '/srv/worktree'")
    expect(exists.script).toContain("test -L '/srv/worktree'")
    expect(exists.script).toContain('__HOBGOBLIN_PATH_EXISTS__')
    expect(exists.script).toContain('__HOBGOBLIN_PATH_MISSING__')
  })

  testPosix('workspace discovery emits only NUL-delimited immediate primary worktrees', async () => {
    const dir = path.join(os.tmpdir(), `hobgoblin-workspace-discovery-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const root = path.join(dir, "work space's")
    const api = path.join(root, 'api')
    const web = path.join(root, 'web')
    const linked = path.join(root, 'linked')
    const linkedTarget = path.join(dir, 'linked-target')
    mkdirSync(root, { recursive: true })
    await execa('git', ['init', api])
    writeFileSync(path.join(api, 'README.md'), 'workspace repository\n')
    await execa('git', ['-C', api, 'add', 'README.md'])
    await execa('git', [
      '-C',
      api,
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Initial commit',
    ])
    await execa('git', ['-C', api, 'worktree', 'add', '-b', 'feature/test', web])
    await execa('git', ['init', linkedTarget])
    symlinkSync(linkedTarget, linked)
    mkdirSync(path.join(root, 'docs'), { recursive: true })

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'listWorkspaceGitDirectories',
      rootPath: root,
    })
    const result = await execa('sh', ['-c', invocation.script])

    expect(result.stdout.split('\0').filter(Boolean).sort()).toEqual([api, linked].sort())
  })

  testPosix(
    'workspace git directory validation accepts a repository symlink but rejects a nested directory',
    async () => {
      const dir = path.join(os.tmpdir(), `hobgoblin-workspace-validation-${Date.now()}-${process.pid}`)
      tempDirs.push(dir)
      const root = path.join(dir, 'workspace')
      const target = path.join(dir, 'repository')
      const linked = path.join(root, 'linked')
      const nested = path.join(target, 'nested')
      mkdirSync(root, { recursive: true })
      mkdirSync(nested, { recursive: true })
      await execa('git', ['init', target])
      symlinkSync(target, linked)

      const linkedValidation = buildRemoteCommandInvocation(TARGET, {
        type: 'testWorkspaceGitDirectory',
        path: linked,
      })
      await expect(execa('sh', ['-c', linkedValidation.script])).resolves.toMatchObject({ exitCode: 0 })

      const nestedValidation = buildRemoteCommandInvocation(TARGET, {
        type: 'testWorkspaceGitDirectory',
        path: nested,
      })
      await expect(execa('sh', ['-c', nestedValidation.script])).rejects.toBeDefined()
    },
  )

  test('renders remote branch listing command', () => {
    expect(buildRemoteCommandInvocation(TARGET, { type: 'gitRemoteBranches', path: '/srv/repo' }).script).toContain(
      "for-each-ref '--format=%(refname:short)' refs/remotes/",
    )
  })

  test('renders remote branch fact listing command with object ids', () => {
    expect(buildRemoteCommandInvocation(TARGET, { type: 'gitRemoteBranchInfo', path: '/srv/repo' }).script).toContain(
      "for-each-ref '--format=%(refname:short)%00%(objectname)' refs/remotes/",
    )
  })

  test('renders exact detached HEAD push without force', () => {
    const script = buildRemoteCommandInvocation(TARGET, {
      type: 'gitPushWorktreeHead',
      path: '/srv/repo-worktree',
      remote: 'origin',
      targetBranch: 'release/v2',
    }).script

    expect(script).toBe("git -C '/srv/repo-worktree' push -- 'origin' 'HEAD:refs/heads/release/v2'")
    expect(script).not.toContain('--force')
  })

  test('renders remote tag listing command for a concrete remote', () => {
    expect(
      buildRemoteCommandInvocation(TARGET, { type: 'gitRemoteTags', path: '/srv/repo', remote: 'origin' }).script,
    ).toContain("ls-remote --tags --refs 'origin'")
  })

  test('renders local tag list, create, and delete commands', () => {
    expect(buildRemoteCommandInvocation(TARGET, { type: 'gitTags', path: '/srv/repo' }).script).toContain(
      "git -C '/srv/repo' tag --sort=-creatordate",
    )
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitTagCreate',
        path: '/srv/repo',
        name: 'v1.0.0',
        ref: 'HEAD',
      }).script,
    ).toContain("git -C '/srv/repo' tag 'v1.0.0' 'HEAD'")
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitTagDelete',
        path: '/srv/repo',
        name: 'v1.0.0',
      }).script,
    ).toContain("git -C '/srv/repo' tag -d 'v1.0.0'")
  })

  test('renders remote server branch delete command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitRemoteBranchDelete',
      path: '/srv/repo',
      remote: 'origin',
      branch: 'feature/remove-me',
    })

    expect(invocation.script).toContain("git -C '/srv/repo' push --delete -- 'origin' 'feature/remove-me'")
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('renders remote server tag delete command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitRemoteTagDelete',
      path: '/srv/repo',
      remote: 'origin',
      tag: 'release/v1.0.0',
    })

    expect(invocation.script).toContain("git -C '/srv/repo' push -- 'origin' ':refs/tags/release/v1.0.0'")
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('renders remote server tag push command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitTagPush',
      path: '/srv/repo',
      remote: 'origin',
      tag: 'v1.0.0',
    })

    expect(invocation.script).toContain("git -C '/srv/repo' push -- 'origin' 'refs/tags/v1.0.0'")
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a quoted one-level remote directory listing command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'listDirectoryEntries',
      worktreePath: '/srv/repo',
      dirPath: "/srv/repo/src with 'quote'",
    })
    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('"/srv/repo"')
    expect(invocation.script).toContain('src with')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds fixed remote file search command with JSON encoded inputs', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'searchFileTree',
      worktreePath: "/srv/repo/user's work",
      query: 'button',
      limit: 50,
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('git')
    expect(invocation.script).toContain("user's work")
    expect(invocation.script).toContain('button')
    expect(invocation.script).toContain('\\"limit\\":50')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote rename command with JSON encoded inputs', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'renameFileTreeEntry',
      worktreePath: '/srv/repo',
      oldPath: "/srv/repo/src/old 'name'.ts",
      newName: 'new name.ts',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('os.rename')
    expect(invocation.script).toContain('"/srv/repo"')
    expect(invocation.script).toContain("old 'name'.ts")
    expect(invocation.script).toContain('new name.ts')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote delete command with JSON encoded paths', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'deleteFileTreeEntries',
      worktreePath: '/srv/repo',
      paths: ['/srv/repo/README.md', '/srv/repo/src'],
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('shutil.rmtree')
    expect(invocation.script).toContain('"/srv/repo/README.md"')
    expect(invocation.script).toContain('"/srv/repo/src"')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote move command with JSON encoded paths and target directory', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'moveFileTreeEntries',
      worktreePath: '/srv/repo',
      paths: ['/srv/repo/README.md', "/srv/repo/src/old 'name'.ts"],
      targetDirPath: '/srv/repo/docs',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('os.rename')
    expect(invocation.script).toContain('"/srv/repo/README.md"')
    expect(invocation.script).toContain("old 'name'.ts")
    expect(invocation.script).toContain('"/srv/repo/docs"')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote create directory command with JSON encoded inputs', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'createFileTreeDirectory',
      worktreePath: '/srv/repo',
      parentDirPath: "/srv/repo/src with 'quote'",
      name: 'components',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('os.mkdir')
    expect(invocation.script).toContain('src with')
    expect(invocation.script).toContain('components')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote create file command with JSON encoded inputs', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'createFileTreeFile',
      worktreePath: '/srv/repo',
      parentDirPath: "/srv/repo/src with 'quote'",
      name: 'index.ts',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('open(target, "xb")')
    expect(invocation.script).toContain('src with')
    expect(invocation.script).toContain('index.ts')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote text file create command that reads content from stdin', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'createFileTreeTextFile',
      worktreePath: '/srv/repo',
      parentDirPath: "/srv/repo/src with 'quote'",
      name: 'notes.md',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('python3 -c')
    expect(invocation.script).not.toContain("<<'PY'")
    expect(invocation.script).toContain('sys.stdin.buffer.read')
    expect(invocation.script).toContain('base64.b64decode')
    expect(invocation.script).toContain('open(target, "xb")')
    expect(invocation.script).toContain('src with')
    expect(invocation.script).toContain('notes.md')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote text file read command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'readFileTreeTextFile',
      worktreePath: '/srv/repo',
      filePath: "/srv/repo/README 'quoted'.md",
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('read_text_file')
    expect(invocation.script).toContain('FILE_TREE_TEXT_FILE_MAX_BYTES')
    expect(invocation.script).toContain("README 'quoted'.md")
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote text file replace command that reads content from stdin', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'replaceFileTreeTextFile',
      worktreePath: '/srv/repo',
      filePath: '/srv/repo/README.md',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('python3 -c')
    expect(invocation.script).not.toContain("<<'PY'")
    expect(invocation.script).toContain('sys.stdin.buffer.read')
    expect(invocation.script).toContain('base64.b64decode')
    expect(invocation.script).toContain('/srv/repo/README.md')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote binary file read command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'readFileTreeBinaryFile',
      worktreePath: '/srv/repo',
      filePath: '/srv/repo/image.bin',
      maxBytes: 31457280,
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('base64.b64encode(raw).decode("ascii")')
    expect(invocation.script).toContain('"bytesBase64"')
    expect(invocation.script).toContain('max_bytes = 31457280')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds a fixed remote binary file replace command that reads base64 from stdin', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'replaceFileTreeBinaryFile',
      worktreePath: '/srv/repo',
      filePath: '/srv/repo/image.bin',
      maxBytes: 31457280,
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('base64.b64decode(stdin_raw, validate=True)')
    expect(invocation.script).toContain('"previousBytesBase64"')
    expect(invocation.script).toContain('with open(file_path, "wb") as handle:')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds quoted remote file inventory command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'fileTransferInventory',
      rootPath: '/srv/repo',
      paths: ['/srv/repo/src', "/srv/repo/file with 'quote'.txt"],
    })
    expect(invocation.script).toContain('fileTransferInventory')
    expect(invocation.script).toContain('"/srv/repo"')
    expect(invocation.args).toContain(TARGET.alias)
  })

  test('builds remote uploaded file write command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'fileTransferWriteBase64',
      targetPath: '/srv/repo/pasted.txt',
    })
    expect(invocation.script).toContain('base64')
    expect(invocation.script).toContain('/srv/repo/pasted.txt')
  })

  test('renders plain managed remote terminal invocation through the ssh command adapter by default', () => {
    const invocation = buildRemoteTerminalInvocation(TARGET, '/srv/repo-feature', {
      cols: 100,
      rows: 30,
      terminalNumber: 2,
    })

    expect(invocation.command).toBe('ssh')
    expect(invocation.args).toEqual([
      '-tt',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '--',
      'prod',
      expect.stringContaining('sh -lc'),
    ])
    expect(invocation.script).toContain("cd '/srv/repo-feature' || exit")
    expect(invocation.script).toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation.script).not.toContain('tmux')
  })

  test('renders tmux-aware managed remote terminal invocation through the ssh command adapter when enabled', () => {
    const invocation = buildRemoteTerminalInvocation(TARGET, '/srv/repo-feature', {
      cols: 100,
      rows: 30,
      terminalNumber: 2,
      useTmux: true,
    })

    expect(invocation.script).toContain('command -v tmux >/dev/null 2>&1')
    expect(invocation.script).toContain("new-session -d -s 'hobgoblin-v1-")
    expect(invocation.script).not.toContain("-s 'goblin-")
    expect(invocation.script).toContain("-c '/srv/repo-feature'")
    expect(invocation.script).toContain('Use New terminal (Native).')
    expect(invocation.script).not.toContain('exec "${SHELL:-/bin/sh}" -l')
  })

  test('keeps non-interactive remote command scripts out of tmux', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitStatus',
      path: '/srv/repo-feature',
    })

    expect(invocation.script).toBe("git -C '/srv/repo-feature' status --porcelain -z")
    expect(invocation.args.join(' ')).not.toContain('tmux')
  })

  test('renders all worktree add modes', () => {
    const existing = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeAdd',
      path: '/srv/repo',
      input: {
        worktreePath: '/srv/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
    }).script
    expect(existing).toContain("worktree add -- '/srv/repo-feature' 'feature/a'")
    expect(existing).not.toContain('hobgoblin-created-from')

    const tracked = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeAdd',
      path: '/srv/repo',
      input: {
        worktreePath: '/srv/repo-feature',
        mode: { kind: 'trackRemoteBranch', remoteRef: 'origin/feature/a', localBranch: 'feature/a' },
        syncBeforeCreate: false,
      },
    }).script
    expect(tracked).toContain("worktree add -b 'feature/a' --track -- '/srv/repo-feature' 'origin/feature/a'")
    expect(tracked).toContain("config --local 'branch.feature/a.hobgoblin-created-from' 'origin/feature/a'")

    const created = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeAdd',
      path: '/srv/repo',
      input: {
        worktreePath: '/srv/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'remoteBranch', remoteRef: 'origin/main' },
        },
        syncBeforeCreate: false,
      },
    }).script
    expect(created).toContain("worktree add -b 'feature/a' -- '/srv/repo-feature' 'origin/main'")
    expect(created).toContain("config --local 'branch.feature/a.hobgoblin-created-from' 'origin/main'")

    const detached = buildRemoteCommandInvocation(TARGET, {
      type: 'gitWorktreeAdd',
      path: '/srv/repo',
      input: {
        worktreePath: '/srv/repo-detached',
        mode: { kind: 'detached', ref: 'origin/feature/a' },
        syncBeforeCreate: false,
      },
    }).script
    expect(detached).toContain("worktree add --detach -- '/srv/repo-detached' 'origin/feature/a'")
    expect(detached).not.toContain('hobgoblin-created-from')
  })

  testPosix('remote best-effort bootstrap materializes deep untracked paths and skips invalid items', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-best-effort-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(path.join(sourceRoot, 'backend', '.venv'), { recursive: true })
    mkdirSync(path.join(sourceRoot, 'frontend', 'node_modules'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'backend', '.venv', 'pyvenv.cfg'), 'placeholder\n')
    writeFileSync(path.join(sourceRoot, 'frontend', 'node_modules', 'package.json'), '{}\n')
    writeFileSync(path.join(sourceRoot, 'tracked.env'), 'tracked\n')
    writeFileSync(path.join(sourceRoot, 'existing.env'), 'source\n')
    writeFileSync(path.join(targetRoot, 'existing.env'), 'target\n')
    await execa('git', ['init', '--quiet'], { cwd: sourceRoot })
    await execa('git', ['add', '--', 'tracked.env'], { cwd: sourceRoot })

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['backend/.venv', 'tracked.env', 'existing.env'],
      symlink: ['frontend/node_modules'],
    })
    const result = await execa('bash', ['-lc', invocation.script], { reject: false })

    expect(invocation.script).toContain('ls-files -z --')
    expect(invocation.script).toContain('backend/.venv')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      'GOBLIN_BOOTSTRAP_COPY\0backend/.venv\0GOBLIN_BOOTSTRAP_SYMLINK\0frontend/node_modules\0',
    )
    expect(readFileSync(path.join(targetRoot, 'backend', '.venv', 'pyvenv.cfg'), 'utf8')).toBe('placeholder\n')
    expect(readlinkSync(path.join(targetRoot, 'frontend', 'node_modules'))).toBe(
      path.join(sourceRoot, 'frontend', 'node_modules'),
    )
    expect(existsSync(path.join(targetRoot, 'tracked.env'))).toBe(false)
    expect(readFileSync(path.join(targetRoot, 'existing.env'), 'utf8')).toBe('target\n')
  })

  testPosix('remote best-effort bootstrap isolates one item failure from later items', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-best-effort-failure-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    const fakeBin = path.join(dir, 'bin')
    mkdirSync(path.join(sourceRoot, 'later'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    mkdirSync(fakeBin)
    writeFileSync(path.join(sourceRoot, 'copy-fails.env'), 'copy\n')
    writeFileSync(path.join(fakeBin, 'cp'), '#!/bin/sh\nexit 1\n')
    chmodSync(path.join(fakeBin, 'cp'), 0o700)
    await execa('git', ['init', '--quiet'], { cwd: sourceRoot })

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['copy-fails.env'],
      symlink: ['later'],
    })
    const result = await execa('bash', ['-c', invocation.script], {
      reject: false,
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('GOBLIN_BOOTSTRAP_SYMLINK\0later\0')
    expect(existsSync(path.join(targetRoot, 'copy-fails.env'))).toBe(false)
    expect(readlinkSync(path.join(targetRoot, 'later'))).toBe(path.join(sourceRoot, 'later'))
  })

  test('renders quoted remote commit command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitCommitAll',
      path: '/srv/repo-feature',
      message: "feat: handle user's changes",
    })

    expect(invocation.script).toContain("git -C '/srv/repo-feature' add -A")
    expect(invocation.script).toContain("git -C '/srv/repo-feature' commit -m 'feat: handle user'\\''s changes'")
  })

  test('renders quoted remote merge command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitMerge',
      path: '/srv/repo-feature',
      branch: "feature/user's-work",
    })

    expect(invocation.script).toBe("git -C '/srv/repo-feature' merge -- 'feature/user'\\''s-work'")
  })

  test('renders quoted remote hard reset command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitResetHard',
      path: "/srv/repo-feature/user's-work",
    })

    expect(invocation.script).toBe("git -C '/srv/repo-feature/user'\\''s-work' reset --hard")
  })

  test('renders remote alignment as reset followed by non-ignored clean', () => {
    const expectedHead = '1'.repeat(40)
    const remoteHead = '2'.repeat(40)
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitAlignToRemote',
      path: "/srv/repo-feature/user's-work",
      branch: "user's-work",
      expectedHead,
      remoteRef: "origin/user's-work",
      remoteHead,
      expectedIndexHash: '3'.repeat(40),
      expectedWorktreeTree: '4'.repeat(40),
    })

    expect(invocation.script).toContain(
      "current_branch=$(git -C '/srv/repo-feature/user'\\''s-work' symbolic-ref --quiet --short HEAD)",
    )
    expect(invocation.script).toContain(
      `current_head=$(git -C '/srv/repo-feature/user'\\''s-work' rev-parse --verify 'HEAD^{commit}')`,
    )
    expect(invocation.script).toContain("rev-parse --verify 'origin/user'\\''s-work^{commit}'")
    expect(invocation.script).toContain("rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'")
    expect(invocation.script).toContain(`ls-files --stage -z > "$tmp_entries"`)
    expect(invocation.script).toContain(`index_hash=$(git -C`)
    expect(invocation.script).toContain(`[ "$index_hash" = '${'3'.repeat(40)}' ]`)
    expect(invocation.script).toContain(`[ "$worktree_tree" = '${'4'.repeat(40)}' ]`)
    expect(invocation.script).toContain("printf '%s\\n' 'error.repository-changed' >&2")
    expect(invocation.script).toContain("printf '%s\\n' 'error.align-remote-clean-incomplete' >&2")
    expect(invocation.script).toContain(
      `git -C '/srv/repo-feature/user'\\''s-work' reset --hard '${remoteHead}' && { git -C '/srv/repo-feature/user'\\''s-work' clean -fd`,
    )
    expect(invocation.script).not.toContain("reset --hard 'origin/user'\\''s-work'")
  })

  testPosix('remote alignment rejects stale content and then removes non-ignored changes', async () => {
    const dir = path.join(os.tmpdir(), `hobgoblin-align-command-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    await execa('git', ['init', dir])
    await execa('git', ['-C', dir, 'switch', '-c', 'feature/test'])
    await execa('git', ['-C', dir, 'config', 'user.name', 'Test User'])
    await execa('git', ['-C', dir, 'config', 'user.email', 'test@example.invalid'])
    writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n')
    writeFileSync(path.join(dir, 'tracked.txt'), 'initial\n')
    await execa('git', ['-C', dir, 'add', '.gitignore', 'tracked.txt'])
    await execa('git', ['-C', dir, 'commit', '-m', 'initial'])
    const expectedHead = (await execa('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout.trim()
    const tree = (await execa('git', ['-C', dir, 'rev-parse', 'HEAD^{tree}'])).stdout.trim()
    const remoteHead = (
      await execa('git', [
        '-C',
        dir,
        '-c',
        'user.name=Test User',
        '-c',
        'user.email=test@example.invalid',
        'commit-tree',
        tree,
        '-p',
        expectedHead,
        '-m',
        'remote',
      ])
    ).stdout.trim()
    await execa('git', ['-C', dir, 'update-ref', 'refs/remotes/origin/feature/test', remoteHead])
    await execa('git', ['-C', dir, 'config', 'remote.origin.url', path.join(dir, 'unused-remote')])
    await execa('git', [
      '-C',
      dir,
      'config',
      'remote.origin.fetch',
      '+refs/heads/*:refs/remotes/origin/*',
    ])
    await execa('git', ['-C', dir, 'config', 'branch.feature/test.remote', 'origin'])
    await execa('git', ['-C', dir, 'config', 'branch.feature/test.merge', 'refs/heads/feature/test'])
    writeFileSync(path.join(dir, 'tracked.txt'), 'confirmed change\n')
    writeFileSync(path.join(dir, 'untracked.txt'), 'remove me\n')
    writeFileSync(path.join(dir, 'ignored.txt'), 'preserve me\n')

    const contentInvocation = buildRemoteCommandInvocation(TARGET, { type: 'gitWorktreeContentState', path: dir })
    const [expectedIndexHash, expectedWorktreeTree] = (
      await execa('sh', ['-c', contentInvocation.script])
    ).stdout.split('\n')
    expect(expectedIndexHash).toMatch(/^[0-9a-f]{40}$/)
    expect(expectedWorktreeTree).toMatch(/^[0-9a-f]{40}$/)
    const alignment = () =>
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitAlignToRemote',
        path: dir,
        branch: 'feature/test',
        expectedHead,
        remoteRef: 'origin/feature/test',
        remoteHead,
        expectedIndexHash: expectedIndexHash!,
        expectedWorktreeTree: expectedWorktreeTree!,
      })

    writeFileSync(path.join(dir, 'tracked.txt'), 'last-second change\n')
    await expect(execa('sh', ['-c', alignment().script])).rejects.toMatchObject({
      stderr: expect.stringContaining('error.repository-changed'),
    })
    await expect(execa('git', ['-C', dir, 'rev-parse', 'HEAD'])).resolves.toMatchObject({ stdout: expectedHead })

    const [currentIndexHash, currentWorktreeTree] = (
      await execa('sh', ['-c', contentInvocation.script])
    ).stdout.split('\n')
    const result = await execa('sh', [
      '-c',
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitAlignToRemote',
        path: dir,
        branch: 'feature/test',
        expectedHead,
        remoteRef: 'origin/feature/test',
        remoteHead,
        expectedIndexHash: currentIndexHash!,
        expectedWorktreeTree: currentWorktreeTree!,
      }).script,
    ])

    expect(result.stdout).toContain('HEAD is now at')
    expect((await execa('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout.trim()).toBe(remoteHead)
    expect(existsSync(path.join(dir, 'untracked.txt'))).toBe(false)
    expect(readFileSync(path.join(dir, 'ignored.txt'), 'utf8')).toBe('preserve me\n')
  })

  test('renders quoted remote discard selected changes command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitDiscardChanges',
      path: "/srv/repo-feature/user's-work",
      paths: ['src/app.ts', "docs/user's guide"],
    })

    expect(invocation.script).toBe(
      "{ git -C '/srv/repo-feature/user'\\''s-work' ls-files --error-unmatch -- 'src/app.ts' >/dev/null 2>&1; code=$?; if [ \"$code\" -eq 0 ]; then git -C '/srv/repo-feature/user'\\''s-work' restore --staged --worktree --source=HEAD -- 'src/app.ts'; elif [ \"$code\" -ne 1 ]; then exit \"$code\"; fi; } && " +
        "{ git -C '/srv/repo-feature/user'\\''s-work' ls-files --error-unmatch -- 'docs/user'\\''s guide' >/dev/null 2>&1; code=$?; if [ \"$code\" -eq 0 ]; then git -C '/srv/repo-feature/user'\\''s-work' restore --staged --worktree --source=HEAD -- 'docs/user'\\''s guide'; elif [ \"$code\" -ne 1 ]; then exit \"$code\"; fi; } && " +
        "git -C '/srv/repo-feature/user'\\''s-work' clean -fd -- 'src/app.ts' 'docs/user'\\''s guide'",
    )
  })

  test('renders quoted remote branch creation commands', () => {
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitBranchCreate',
        path: '/srv/repo',
        branch: "feature/user's-work",
        baseBranch: 'main',
      }).script,
    ).toBe(
      "git -C '/srv/repo' branch -- 'feature/user'\\''s-work' 'main' && { git -C '/srv/repo' config --local 'branch.feature/user'\\''s-work.hobgoblin-created-from' 'main' || true; }",
    )

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitBranchTrackRemote',
        path: '/srv/repo',
        localBranch: 'feature/new',
        remoteRef: 'origin/feature/new',
      }).script,
    ).toBe(
      "git -C '/srv/repo' branch --track -- 'feature/new' 'origin/feature/new' && { git -C '/srv/repo' config --local 'branch.feature/new.hobgoblin-created-from' 'origin/feature/new' || true; }",
    )

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitCheckoutTracking',
        path: "/srv/repo-feature/user's-work",
        localBranch: "feature/user's-work",
        remoteRef: "origin/feature/user's-work",
      } as Parameters<typeof buildRemoteCommandInvocation>[1]).script,
    ).toBe(
      "git -C '/srv/repo-feature/user'\\''s-work' switch --track -c 'feature/user'\\''s-work' -- 'origin/feature/user'\\''s-work' && { git -C '/srv/repo-feature/user'\\''s-work' config --local 'branch.feature/user'\\''s-work.hobgoblin-created-from' 'origin/feature/user'\\''s-work' || true; }",
    )
  })

  test('renders quoted remote branch upstream commands', () => {
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitBranchSetUpstream',
        path: '/srv/repo',
        branch: "feature/user's-work",
        remoteRef: 'origin/release',
      } as Parameters<typeof buildRemoteCommandInvocation>[1]).script,
    ).toBe("git -C '/srv/repo' branch --set-upstream-to='origin/release' -- 'feature/user'\\''s-work'")

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitBranchSetUpstream',
        path: '/srv/repo',
        branch: "feature/user's-work",
        remoteRef: null,
      } as Parameters<typeof buildRemoteCommandInvocation>[1]).script,
    ).toBe("git -C '/srv/repo' branch --unset-upstream -- 'feature/user'\\''s-work'")
  })

  test('builds structured git history command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitHistory',
      path: '/srv/repo',
      branch: 'feature/history',
      limit: 500,
      skip: -1,
    })

    expect(invocation.script).toContain("git -C '/srv/repo' log")
    expect(invocation.script).toContain('--max-count=200')
    expect(invocation.script).toContain('--skip=0')
    expect(invocation.script).toContain("'feature/history'")
    expect(invocation.script).toContain('%P')
  })

  test('builds structured git commit detail commands', () => {
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitCommitMetadata',
        path: '/srv/repo',
        commit: 'abc1234',
      }).script,
    ).toContain("git -C '/srv/repo' show -s")

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitCommitNameStatus',
        path: '/srv/repo',
        commit: 'abc1234',
      }).script,
    ).toContain('diff-tree --no-commit-id --name-status -r -M -C --root -z')

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitCommitNumstat',
        path: '/srv/repo',
        commit: 'abc1234',
      }).script,
    ).toContain('diff-tree --no-commit-id --numstat -r -M -C --root -z')
  })
})
