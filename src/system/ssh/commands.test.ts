import { describe, expect, test } from 'vitest'
import { buildRemoteCommandInvocation, buildRemoteTerminalInvocation } from '#/system/ssh/commands.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
})!

describe('remote command scripts', () => {
  test('renders remote branch listing command', () => {
    expect(buildRemoteCommandInvocation(TARGET, { type: 'gitRemoteBranches', path: '/srv/repo' }).script).toContain(
      "for-each-ref '--format=%(refname:short)' refs/remotes/",
    )
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
    expect(invocation.script).toContain("exec tmux new-session -A -s 'goblin-")
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
