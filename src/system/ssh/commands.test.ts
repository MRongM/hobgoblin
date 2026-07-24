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
  test('builds tmux list and kill commands without session ids', () => {
    const serverName = 'hobgoblin-project-v1-44159cd9e973adba7b472e6f'
    const list = buildRemoteCommandInvocation(TARGET, { type: 'tmuxListSessions', projectRoot: '/srv/repo' })
    const killByName = buildRemoteCommandInvocation(TARGET, {
      type: 'tmuxKillSessionByName',
      projectRoot: '/srv/repo',
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      serverName,
    })

    expect(list.script).toContain(`tmux -L '${serverName}' -u list-sessions`)
    expect(list.script).toContain(`#{session_name}\t${serverName}`)
    expect(list.script).toContain('tmux -u list-sessions')
    expect(list.script).toContain('#{session_name}\tlegacy-default')
    expect(killByName.script).toBe(
      "command -v tmux >/dev/null 2>&1 || exit 127\ntmux -L 'hobgoblin-project-v1-44159cd9e973adba7b472e6f' kill-session -t '=hobgoblin-v1-aebf050981ac829e36100020'",
    )
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
    const failed = await execa('sh', ['-c', invocation.script], {
      env: { ...environment, FAKE_PROJECT_MESSAGE: 'permission denied', FAKE_PROJECT_STATUS: '2' },
      reject: false,
    })

    expect(absent.exitCode).toBe(0)
    expect(absent.stdout).toBe('')
    expect(absent.stderr).toBe('')
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

  test('builds safely quoted worktree bootstrap candidate discovery', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'worktreeBootstrapCandidates',
      sourceRoot: "/srv/user's repo",
    })

    expect(invocation.script).toContain('root = "/srv/user\'s repo"')
    expect(invocation.script).toContain('git", "-C", root, "ls-files", "-z"')
    expect(invocation.script).toContain('os.listdir(root)')
    expect(invocation.script).toContain('os.lstat(os.path.join(root, name))')
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
    expect(list.script).toMatch(/hobgoblin-.*goblin-/)

    const create = buildRemoteCommandInvocation(TARGET, {
      type: 'createBranchWorkspaceDirectory',
      rootPath: '/srv/workspace',
      targetPath: '/srv/workspace/hobgoblin-feature',
    })
    expect(create.script).toMatch(/hobgoblin-.*goblin-/)
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
    const branchRoot = path.join(root, 'hobgoblin-feature')
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
      name: 'goblin.toml',
    })

    expect(invocation.script).toContain('python3')
    expect(invocation.script).toContain('python3 -c')
    expect(invocation.script).not.toContain("<<'PY'")
    expect(invocation.script).toContain('sys.stdin.buffer.read')
    expect(invocation.script).toContain('base64.b64decode')
    expect(invocation.script).toContain('open(target, "xb")')
    expect(invocation.script).toContain('src with')
    expect(invocation.script).toContain('goblin.toml')
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
    expect(invocation.script).toContain("exec tmux new-session -A -s 'hobgoblin-v1-")
    expect(invocation.script).not.toContain("-s 'goblin-")
    expect(invocation.script).toContain("-c '/srv/repo-feature'")
    expect(invocation.script).toContain('exec "${SHELL:-/bin/sh}" -l')
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
    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitWorktreeAdd',
        path: '/srv/repo',
        input: { worktreePath: '/srv/repo-feature', mode: { kind: 'existingBranch', branch: 'feature/a' } },
      }).script,
    ).toContain("worktree add -- '/srv/repo-feature' 'feature/a'")

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitWorktreeAdd',
        path: '/srv/repo',
        input: {
          worktreePath: '/srv/repo-feature',
          mode: { kind: 'trackRemoteBranch', remoteRef: 'origin/feature/a', localBranch: 'feature/a' },
        },
      }).script,
    ).toContain("worktree add -b 'feature/a' --track -- '/srv/repo-feature' 'origin/feature/a'")

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitWorktreeAdd',
        path: '/srv/repo',
        input: { worktreePath: '/srv/repo-detached', mode: { kind: 'detached', ref: 'origin/feature/a' } },
      }).script,
    ).toContain("worktree add --detach -- '/srv/repo-detached' 'origin/feature/a'")
  })

  test('remote bootstrap script handles space paths and excludes copied tree children', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo root')
    const targetRoot = path.join(dir, 'worktree root')
    mkdirSync(path.join(sourceRoot, 'config dir', '.git'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'foo bar.txt'), 'space\n')
    writeFileSync(path.join(sourceRoot, 'config dir', 'app.json'), 'ok\n')
    writeFileSync(path.join(sourceRoot, 'config dir', 'debug.log'), 'skip\n')
    writeFileSync(path.join(sourceRoot, 'config dir', '.git', 'config'), 'skip git\n')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['foo bar.txt', 'config dir'],
      symlink: [],
      hardlink: [],
      exclude: ['config dir/*.log'],
    })

    const result = await execa('bash', ['-lc', invocation.script])

    expect(result.stdout.split('\n')).toEqual(['GOBLIN_BOOTSTRAP_COPY foo bar.txt', 'GOBLIN_BOOTSTRAP_COPY config dir'])
    expect(readFileSync(path.join(targetRoot, 'foo bar.txt'), 'utf8')).toBe('space\n')
    expect(readFileSync(path.join(targetRoot, 'config dir', 'app.json'), 'utf8')).toBe('ok\n')
    expect(existsSync(path.join(targetRoot, 'config dir', 'debug.log'))).toBe(false)
    expect(existsSync(path.join(targetRoot, 'config dir', '.git', 'config'))).toBe(false)
  })

  testPosix('remote bootstrap inspection classifies exact links and conflicts without writing', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(path.join(sourceRoot, 'node_modules'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, '.env'), 'source\n')
    writeFileSync(path.join(sourceRoot, 'missing.env'), 'missing\n')
    writeFileSync(path.join(targetRoot, '.env'), 'target\n')
    symlinkSync(
      path.relative(targetRoot, path.join(sourceRoot, 'node_modules')),
      path.join(targetRoot, 'node_modules'),
      'dir',
    )

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['.env', 'missing.env'],
      symlink: ['node_modules'],
      hardlink: [],
      exclude: [],
      inspectOnly: true,
    })

    const result = await execa('bash', ['-lc', invocation.script])

    expect(result.stdout).toBe(
      [
        'GOBLIN_BOOTSTRAP_CONFLICT copy .env',
        'GOBLIN_BOOTSTRAP_PENDING copy missing.env',
        'GOBLIN_BOOTSTRAP_SATISFIED symlink node_modules',
      ].join('\n'),
    )
    expect(readFileSync(path.join(targetRoot, '.env'), 'utf8')).toBe('target\n')
  })

  test('remote bootstrap replaces only an explicitly approved target', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(path.join(sourceRoot, 'cache'), { recursive: true })
    mkdirSync(path.join(targetRoot, 'cache'), { recursive: true })
    writeFileSync(path.join(sourceRoot, 'cache', 'fresh.txt'), 'fresh\n')
    writeFileSync(path.join(targetRoot, 'cache', 'stale.txt'), 'stale\n')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['cache'],
      symlink: [],
      hardlink: [],
      exclude: [],
      replaceExisting: [{ path: 'cache', mode: 'copy' }],
    })

    const result = await execa('bash', ['-lc', invocation.script])

    expect(result.stdout).toBe('GOBLIN_BOOTSTRAP_COPY cache')
    expect(readFileSync(path.join(targetRoot, 'cache', 'fresh.txt'), 'utf8')).toBe('fresh\n')
    expect(existsSync(path.join(targetRoot, 'cache', 'stale.txt'))).toBe(false)
  })

  test('remote bootstrap rejects unapproved and out-of-plan replacement targets without removing content', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, '.env'), 'source\n')
    writeFileSync(path.join(targetRoot, '.env'), 'target\n')

    const base = {
      type: 'bootstrapRemoteWorktree' as const,
      sourceRoot,
      targetRoot,
      copy: ['.env'],
      symlink: [],
      hardlink: [],
      exclude: [],
    }
    const unapproved = await execa('bash', ['-lc', buildRemoteCommandInvocation(TARGET, base).script], {
      reject: false,
    })
    const outsidePlan = await execa(
      'bash',
      [
        '-lc',
        buildRemoteCommandInvocation(TARGET, {
          ...base,
          replaceExisting: [{ path: 'other.env', mode: 'copy' }],
        }).script,
      ],
      { reject: false },
    )

    expect(unapproved.exitCode).toBe(1)
    expect(unapproved.stderr).toContain('destination already exists: .env')
    expect(outsidePlan.exitCode).toBe(1)
    expect(outsidePlan.stderr).toContain('invalid replacement target: other.env')
    expect(readFileSync(path.join(targetRoot, '.env'), 'utf8')).toBe('target\n')
  }, 15_000)

  test('remote bootstrap literal mode does not expand shell metacharacters', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-literal-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    const literalName = "literal *?[x] $ user's.txt"
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, literalName), 'literal\n')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: [literalName],
      symlink: [],
      hardlink: [],
      exclude: [],
      literalPaths: true,
    })

    const result = await execa('bash', ['-lc', invocation.script])

    expect(result.stdout).toBe(`GOBLIN_BOOTSTRAP_COPY ${literalName}`)
    expect(readFileSync(path.join(targetRoot, literalName), 'utf8')).toBe('literal\n')
  })

  testPosix('remote bootstrap script rejects sources under a symlink parent', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    const outside = path.join(dir, 'outside')
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(outside, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(outside, 'secret.txt'), 'secret\n')
    symlinkSync(outside, path.join(sourceRoot, 'linked-dir'), 'dir')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['linked-dir/secret.txt'],
      symlink: [],
      hardlink: [],
      exclude: [],
    })

    const result = await execa('bash', ['-lc', invocation.script], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('bootstrap path uses symlink parent: linked-dir')
    expect(existsSync(path.join(targetRoot, 'linked-dir', 'secret.txt'))).toBe(false)
  })

  testPosix('remote bootstrap script rejects targets under a symlink parent', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    const outside = path.join(dir, 'outside')
    mkdirSync(path.join(sourceRoot, 'linked-dir'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'linked-dir', 'secret.txt'), 'secret\n')
    symlinkSync(outside, path.join(targetRoot, 'linked-dir'), 'dir')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['linked-dir/secret.txt'],
      symlink: [],
      hardlink: [],
      exclude: [],
    })

    const result = await execa('bash', ['-lc', invocation.script], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('bootstrap target path uses symlink parent: linked-dir')
    expect(existsSync(path.join(outside, 'secret.txt'))).toBe(false)
  })

  test('remote bootstrap script keeps setup output out of the marker stream', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    const setup = "printf 'GOBLIN_BOOTSTRAP_COPY spoofed\\n'; printf 'setup stderr\\n' >&2"

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: [],
      symlink: [],
      hardlink: [],
      exclude: [],
      setup,
    })

    const result = await execa('bash', ['-lc', invocation.script], { env: { SHELL: '/bin/sh' } })

    expect(result.stdout).toBe(`GOBLIN_BOOTSTRAP_SETUP ${setup}`)
    expect(result.stderr).toBe('')
  })

  test('remote bootstrap script rejects ambiguous paths before writing', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'shared.local'), 'value\n')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['*.local'],
      symlink: ['shared.local'],
      hardlink: [],
      exclude: [],
    })

    const result = await execa('bash', ['-lc', invocation.script], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('path matches multiple materialization modes: shared.local')
    expect(existsSync(path.join(targetRoot, 'shared.local'))).toBe(false)
  })

  test('remote bootstrap script ignores .git matches from globs', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(path.join(sourceRoot, 'config', '.git'), { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'config', 'app.json'), 'ok\n')
    writeFileSync(path.join(sourceRoot, 'config', '.git', 'config'), 'skip git\n')

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['config/*'],
      symlink: [],
      hardlink: [],
      exclude: [],
    })

    const result = await execa('bash', ['-lc', invocation.script])

    expect(result.stdout).toBe('GOBLIN_BOOTSTRAP_COPY config/app.json')
    expect(readFileSync(path.join(targetRoot, 'config', 'app.json'), 'utf8')).toBe('ok\n')
    expect(existsSync(path.join(targetRoot, 'config', '.git', 'config'))).toBe(false)
  })

  testPosix('remote bootstrap script fails when a materialization command fails', async () => {
    const dir = path.join(os.tmpdir(), `goblin-remote-bootstrap-test-${Date.now()}-${process.pid}`)
    tempDirs.push(dir)
    const sourceRoot = path.join(dir, 'repo')
    const targetRoot = path.join(dir, 'worktree')
    mkdirSync(sourceRoot, { recursive: true })
    mkdirSync(targetRoot, { recursive: true })
    writeFileSync(path.join(sourceRoot, 'a.txt'), 'a\n')
    const fakeBin = path.join(dir, 'bin')
    mkdirSync(fakeBin)
    writeFileSync(path.join(fakeBin, 'cp'), '#!/bin/sh\nexit 1\n')
    chmodSync(path.join(fakeBin, 'cp'), 0o700)

    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'bootstrapRemoteWorktree',
      sourceRoot,
      targetRoot,
      copy: ['a.txt'],
      symlink: [],
      hardlink: [],
      exclude: [],
    })

    const result = await execa('bash', ['-c', invocation.script], {
      reject: false,
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('failed to copy a.txt')
    expect(existsSync(path.join(targetRoot, 'a.txt'))).toBe(false)
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
    ).toBe("git -C '/srv/repo' branch -- 'feature/user'\\''s-work' 'main'")

    expect(
      buildRemoteCommandInvocation(TARGET, {
        type: 'gitBranchTrackRemote',
        path: '/srv/repo',
        localBranch: 'feature/new',
        remoteRef: 'origin/feature/new',
      }).script,
    ).toBe("git -C '/srv/repo' branch --track -- 'feature/new' 'origin/feature/new'")
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
