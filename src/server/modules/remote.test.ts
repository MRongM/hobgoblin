import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveRemoteTarget: vi.fn(),
  resolveRepositoryRemoteTarget: vi.fn(),
  getServerSettingsPrefs: vi.fn(),
  openRemoteInPreferredEditor: vi.fn(),
  openWslInPreferredEditor: vi.fn(),
  openRemoteInPreferredTerminal: vi.fn(),
  openWslInWindowsTerminal: vi.fn(),
}))

vi.mock('#/system/ssh/config.ts', () => ({
  listSshConfigHosts: vi.fn(),
  resolveRemoteTarget: mocks.resolveRemoteTarget,
  resolveTrackedRemoteTarget: vi.fn(),
}))
vi.mock('#/system/ssh/commands.ts', () => ({ runRemoteCommand: vi.fn() }))
vi.mock('#/system/ssh/diagnostics.ts', () => ({ testRemoteRepository: vi.fn() }))
vi.mock('#/system/remote/target.ts', () => ({
  resolveRepositoryRemoteTarget: mocks.resolveRepositoryRemoteTarget,
}))
vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
}))
vi.mock('#/system/editors.ts', () => ({
  openRemoteInPreferredEditor: mocks.openRemoteInPreferredEditor,
  openWslInPreferredEditor: mocks.openWslInPreferredEditor,
}))
vi.mock('#/system/terminals.ts', () => ({
  openRemoteInPreferredTerminal: mocks.openRemoteInPreferredTerminal,
}))
vi.mock('#/system/windows-terminal.ts', () => ({
  openWslInWindowsTerminal: mocks.openWslInWindowsTerminal,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSettingsPrefs.mockResolvedValue({
    theme: 'auto',
    colorTheme: 'macos',
    lang: 'auto',
    fetchIntervalSec: 120,
    terminalNotificationsEnabled: false,
    shortcutsDisabled: false,
    globalShortcutDisabled: false,
    swapCloseShortcuts: false,
    globalShortcut: 'CommandOrControl+Shift+G',
    terminalApp: 'auto',
    editorApp: 'vscode',
    fileTreeFontSize: 12,
    terminalFontSize: 14,
    terminalCustomButtonsVisible: true,
    terminalCustomButtons: [],
    lanEnabled: false,
  })
  mocks.resolveRemoteTarget.mockResolvedValue({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })
  mocks.resolveRepositoryRemoteTarget.mockResolvedValue({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })
  mocks.openRemoteInPreferredEditor.mockResolvedValue({ ok: true, message: '/srv/repo-feature' })
  mocks.openWslInPreferredEditor.mockResolvedValue({ ok: true, message: '/root/src/repo-feature' })
  mocks.openRemoteInPreferredTerminal.mockResolvedValue({ ok: true, message: '/srv/repo-feature' })
  mocks.openWslInWindowsTerminal.mockResolvedValue({ ok: true, message: '/root/src/repo-feature' })
})

describe('openServerRemoteEditor', () => {
  test('resolves ssh config and opens the configured remote editor', async () => {
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteEditor({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })

    expect(mocks.resolveRepositoryRemoteTarget).toHaveBeenCalledWith(
      { alias: 'prod', remotePath: '/srv/repo' },
      undefined,
    )
    expect(mocks.openRemoteInPreferredEditor).toHaveBeenCalledWith('prod', '/srv/repo-feature', 'vscode')
  })

  test('opens a structured remote editor target', async () => {
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteEditor({
        repoId: 'ssh-config://prod/srv/repo',
        target: { path: '/srv/repo/src/app.ts', line: 12 },
      }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })

    expect(mocks.openRemoteInPreferredEditor).toHaveBeenCalledWith(
      'prod',
      { path: '/srv/repo/src/app.ts', line: 12 },
      'vscode',
    )
  })

  test('opens a WSL project in the matching editor authority', async () => {
    mocks.resolveRepositoryRemoteTarget.mockResolvedValueOnce({
      target: {
        id: 'wsl://Ubuntu-24.04/root/src/repo',
        alias: 'Ubuntu-24.04',
        host: 'Ubuntu-24.04',
        user: 'wsl',
        port: 22,
        remotePath: '/root/src/repo',
        displayName: 'Ubuntu-24.04:repo',
        transport: 'wsl',
        wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
      },
    })
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteEditor({
        repoId: 'wsl://Ubuntu-24.04/root/src/repo',
        worktreePath: '/root/src/repo-feature',
      }),
    ).resolves.toEqual({ ok: true, message: '/root/src/repo-feature' })

    expect(mocks.resolveRepositoryRemoteTarget).toHaveBeenCalledWith(
      { alias: 'Ubuntu-24.04', remotePath: '/root/src/repo', transport: 'wsl' },
      undefined,
    )
    expect(mocks.openWslInPreferredEditor).toHaveBeenCalledWith('Ubuntu-24.04', '/root/src/repo-feature', 'vscode')
  })

  test('rejects invalid repo ids and remote worktree paths', async () => {
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(openServerRemoteEditor({ repoId: '/tmp/local', worktreePath: '/srv/repo' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(
      openServerRemoteEditor({ repoId: 'ssh-config://prod/srv/repo', worktreePath: 'relative/repo' }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(mocks.openRemoteInPreferredEditor).not.toHaveBeenCalled()
  })

  test('returns ssh-config-changed when the saved remote no longer resolves', async () => {
    mocks.resolveRepositoryRemoteTarget.mockRejectedValue(new Error('error.ssh-config-changed'))
    const { openServerRemoteEditor } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteEditor({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
  })
})

describe('openServerRemoteTerminal', () => {
  test('resolves project identity and opens remote external terminal-1 with the native login shell', async () => {
    mocks.getServerSettingsPrefs.mockResolvedValue({
      terminalApp: 'auto',
    })
    const { openServerRemoteTerminal } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteTerminal({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    ).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })

    expect(mocks.resolveRepositoryRemoteTarget).toHaveBeenCalledWith(
      { alias: 'prod', remotePath: '/srv/repo' },
      undefined,
    )
    expect(mocks.openRemoteInPreferredTerminal).toHaveBeenCalledWith(
      {
        alias: 'prod',
        projectRoot: '/srv/repo',
        workingDirectory: '/srv/repo-feature',
        terminalNumber: 1,
      },
      'auto',
    )
  })

  test('opens a WSL project in Windows Terminal at its Linux path', async () => {
    mocks.resolveRepositoryRemoteTarget.mockResolvedValueOnce({
      target: {
        id: 'wsl://Ubuntu-24.04/root/src/repo',
        alias: 'Ubuntu-24.04',
        host: 'Ubuntu-24.04',
        user: 'wsl',
        port: 22,
        remotePath: '/root/src/repo',
        displayName: 'Ubuntu-24.04:repo',
        transport: 'wsl',
        wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
      },
    })
    const { openServerRemoteTerminal } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteTerminal({
        repoId: 'wsl://Ubuntu-24.04/root/src/repo',
        worktreePath: '/root/src/repo-feature',
      }),
    ).resolves.toEqual({ ok: true, message: '/root/src/repo-feature' })

    expect(mocks.openWslInWindowsTerminal).toHaveBeenCalledWith('Ubuntu-24.04', '/root/src/repo-feature')
    expect(mocks.openRemoteInPreferredTerminal).not.toHaveBeenCalled()
  })

  test('rejects invalid repo ids and remote worktree paths', async () => {
    const { openServerRemoteTerminal } = await import('#/server/modules/remote.ts')

    await expect(openServerRemoteTerminal({ repoId: '/tmp/local', worktreePath: '/srv/repo' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(
      openServerRemoteTerminal({ repoId: 'ssh-config://prod/srv/repo', worktreePath: 'relative/repo' }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(mocks.openRemoteInPreferredTerminal).not.toHaveBeenCalled()
  })

  test('returns ssh-config-changed when the saved remote no longer resolves', async () => {
    mocks.resolveRepositoryRemoteTarget.mockRejectedValue(new Error('error.ssh-config-changed'))
    const { openServerRemoteTerminal } = await import('#/server/modules/remote.ts')

    await expect(
      openServerRemoteTerminal({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
  })
})
