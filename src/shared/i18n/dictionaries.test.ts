import { describe, expect, test } from 'vitest'
import { en, ja, ko, zh, type DictKey } from '#/shared/i18n/dictionaries.ts'

const dicts = { en, zh, ko, ja } as const

function placeholders(value: string): string[] {
  return Array.from(new Set(Array.from(value.matchAll(/\{(\w+)\}/g), (match) => match[1]!).sort()))
}

function componentTags(value: string): string[] {
  return Array.from(new Set(Array.from(value.matchAll(/<\/?([A-Za-z][\w-]*)>/g), (match) => match[1]!).sort()))
}

describe('i18n dictionaries', () => {
  test('does not contain empty or whitespace-only values', () => {
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
      }
    }
  })

  test('keeps placeholders and rich-text component tags aligned with English', () => {
    const keys = Object.keys(en) as DictKey[]
    for (const lang of ['zh', 'ko', 'ja'] as const) {
      for (const key of keys) {
        expect(placeholders(dicts[lang][key]), `${lang}.${key} placeholders`).toEqual(placeholders(en[key]))
        expect(componentTags(dicts[lang][key]), `${lang}.${key} component tags`).toEqual(componentTags(en[key]))
      }
    }
  })

  test('preserves official classic theme names in every dictionary', () => {
    const expected = {
      'settings.theme-preset.catppuccin': 'Catppuccin',
      'settings.theme-preset.solarized': 'Solarized',
      'settings.theme-preset.tokyo-night': 'Tokyo Night',
    }

    for (const [lang, dict] of Object.entries(dicts)) {
      expect(dict, lang).toMatchObject(expected)
    }
  })

  test('localizes menu and remote repository copy for non-English dictionaries', () => {
    expect(zh['menu.file.open-remote-repo']).toBe('打开远程仓库…')
    expect(ko['menu.file.open-remote-repo']).toBe('원격 리포지토리 열기…')
    expect(ja['menu.file.open-remote-repo']).toBe('リモートリポジトリを開く…')

    expect(zh['repo-tabs.open-remote']).toBe('打开远程仓库…')
    expect(ko['repo-tabs.open-remote']).toBe('원격 리포지토리 열기…')
    expect(ja['repo-tabs.open-remote']).toBe('リモートリポジトリを開く…')

    expect(ko['repo-tabs.open-remote-host-label']).toBe('호스트')
    expect(ja['repo-tabs.open-remote-host-label']).toBe('ホスト')
    expect(ko['repo-tabs.open-remote-port-label']).toBe('포트')
    expect(ja['repo-tabs.open-remote-port-label']).toBe('ポート')
    expect(ko['repo-tabs.open-remote-username-label']).toBe('사용자 이름')
    expect(ja['repo-tabs.open-remote-username-label']).toBe('ユーザー名')
    expect(ko['repo-tabs.open-remote-private-key-label']).toBe('개인 키')
    expect(ja['repo-tabs.open-remote-private-key-label']).toBe('秘密鍵')
    expect(ko['repo-tabs.open-remote-private-key-choose']).toBe('개인 키 선택')
    expect(ja['repo-tabs.open-remote-private-key-choose']).toBe('秘密鍵を選択')
    expect(ko['repo-tabs.open-remote-path-label']).toBe('원격 경로')
    expect(ja['repo-tabs.open-remote-path-label']).toBe('リモートパス')
  })

  test('distinguishes Chinese pull and remote tracking branch actions', () => {
    expect(zh['tab.remote-branches']).toBe('远程')
    expect(zh['action.pull']).toBe('拉取')
    expect(zh['action.create-branch']).toBe('从本地新建分支')
    expect(zh['action.create-branch-title']).toBe('从本地新建分支')
    expect(zh['action.pull-remote-branch']).toBe('从远程新建分支')
    expect(zh['action.pull-remote-branch-title']).toBe('从远程分支创建本地分支')
    expect(zh['action.merge-and-push-confirm']).toBe('拉合推')
  })

  test('uses detection copy for local branch and status refreshes', () => {
    expect(zh['action.fetch-local-title']).toBe('检测分支和状态')
  })

  test('distinguishes Chinese destructive branch actions', () => {
    expect(zh['action.remove-worktree']).toBe('删除工作树')
    expect(zh['action.delete-branch']).toBe('删除分支')
  })

  test('includes invalid worktree cleanup copy in every locale', () => {
    const keys = [
      'action.cleanup-invalid-worktree',
      'action.cleanup-invalid-worktree-cleaning-title',
      'action.cleanup-invalid-worktree-queued-title',
      'action.cleanup-invalid-worktree-cleaned-title',
      'action.confirm-cleanup-invalid-worktree-title',
      'action.confirm-cleanup-invalid-worktree-body',
      'action.confirm-cleanup-invalid-worktree-note',
      'action.confirm-cleanup-invalid-worktree-confirm',
      'error.worktree-not-prunable',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['action.cleanup-invalid-worktree']).toBe('清理无效工作树')
    expect(zh['action.confirm-cleanup-invalid-worktree-body']).toContain('不会删除分支')
    expect(zh['action.confirm-cleanup-invalid-worktree-note']).toContain('磁盘')
  })

  test('warns that branch workspace removal discards uncommitted changes in every locale', () => {
    expect(en['workspace.branch-workspace.delete-warning']).toContain('uncommitted changes')
    expect(zh['workspace.branch-workspace.delete-warning']).toContain('未提交改动')
    expect(ja['workspace.branch-workspace.delete-warning']).toContain('未コミットの変更')
    expect(ko['workspace.branch-workspace.delete-warning']).toContain('커밋하지 않은 변경 사항')
  })

  test('includes branch workspace member management copy in every locale', () => {
    const keys = [
      'workspace.branch-workspace.add-members',
      'workspace.branch-workspace.remove-members',
      'workspace.branch-workspace.continue-reduce',
      'workspace.branch-workspace.reduce-retains-branches',
      'workspace.branch-workspace.approval.discard-member-changes',
      'workspace.branch-workspace.dialog.extend.title',
      'workspace.branch-workspace.dialog.extend.description',
      'workspace.branch-workspace.dialog.extend.confirm',
      'workspace.branch-workspace.dialog.reduce.title',
      'workspace.branch-workspace.dialog.reduce.description',
      'workspace.branch-workspace.dialog.reduce.confirm',
      'workspace.branch-workspace.lifecycle.reduce-incomplete',
      'workspace.branch-workspace.member-required',
      'workspace.branch-workspace.dirty-state-unknown',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.reduce-retains-branches']).toContain('保留')
  })

  test('uses the agreed branch workspace terminology in Chinese product copy', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value, key).not.toContain('子仓库')
    }
    expect(en['workspace.branch-workspace.member.open-worktree']).toBe('Open this member worktree')
    expect(zh['workspace.branch-workspace.member.open-worktree']).toBe('打开此成员工作树')
  })

  test('describes branch workspace registry cleanup without claiming filesystem deletion', () => {
    const keys = [
      'workspace.branch-workspace.cleanup',
      'workspace.branch-workspace.cleanup-title',
      'workspace.branch-workspace.cleanup-description',
      'workspace.branch-workspace.cleanup-confirm',
      'workspace.branch-workspace.cleanup-success.repaired',
      'workspace.branch-workspace.cleanup-success.reset',
      'workspace.branch-workspace.cleanup-success.unchanged',
      'workspace.branch-workspace.cleanup-failed',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.cleanup-description']).toContain('不会删除')
    expect(zh['workspace.branch-workspace.cleanup-description']).toContain('工作树')
    expect(zh['workspace.branch-workspace.cleanup-description']).toContain('分支')
  })

  test('uses branch workspace dependency copy and includes member sync actions in every locale', () => {
    expect(zh['workspace.branch-workspace.auxiliary']).toBe('子工作区依赖')
    expect(zh['workspace.branch-workspace.auxiliary-refresh']).toBe('刷新子工作区依赖')
    expect(zh['workspace.branch-workspace.auxiliary-named']).toBe('包含子工作区依赖 {name}')
    expect(zh['workspace.branch-workspace.auxiliary-empty']).toBe('没有可选择的子工作区依赖。')

    const keys = [
      'workspace.branch-workspace.member.open-worktree',
      'workspace.branch-workspace.git-action.pull',
      'workspace.branch-workspace.git-action.pull-description',
      'workspace.branch-workspace.git-action.push',
      'workspace.branch-workspace.git-action.push-description',
      'workspace.branch-workspace.git-action.target-upstream-required',
      'workspace.branch-workspace.git-action.remote-required',
    ] as const
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
  })

  test('includes branch workspace dependency maintenance copy in every locale', () => {
    const keys = [
      'workspace.branch-workspace.dependency.add.action',
      'workspace.branch-workspace.dependency.remove.action',
      'workspace.branch-workspace.dependency.add.title',
      'workspace.branch-workspace.dependency.add.description',
      'workspace.branch-workspace.dependency.add.available',
      'workspace.branch-workspace.dependency.add.available-description',
      'workspace.branch-workspace.dependency.add.empty',
      'workspace.branch-workspace.dependency.add.confirm',
      'workspace.branch-workspace.dependency.remove.title',
      'workspace.branch-workspace.dependency.remove.description',
      'workspace.branch-workspace.dependency.remove.available',
      'workspace.branch-workspace.dependency.remove.available-description',
      'workspace.branch-workspace.dependency.remove.empty',
      'workspace.branch-workspace.dependency.remove.confirm',
      'workspace.branch-workspace.dependency.preview-title',
      'workspace.branch-workspace.dependency.operation.add',
      'workspace.branch-workspace.dependency.operation.remove',
      'workspace.branch-workspace.dependency.approval.outside-root-source',
      'workspace.branch-workspace.dependency.planning',
      'workspace.branch-workspace.dependency.not-ready',
      'workspace.branch-workspace.dependency.read-failed',
      'workspace.branch-workspace.dependency.target-exists',
      'workspace.branch-workspace.dependency.target-missing',
      'workspace.branch-workspace.dependency.unavailable',
      'workspace.branch-workspace.dependency.operation-in-progress',
      'workspace.branch-workspace.dependency.approval-required',
      'workspace.branch-workspace.dependency.plan-stale',
      'workspace.branch-workspace.dependency.plan-failed',
      'workspace.branch-workspace.dependency.execute-failed',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.dependency.add.action']).toBe('添加依赖项')
    expect(zh['workspace.branch-workspace.dependency.remove.action']).toBe('移除依赖项')
  })

  test('includes repository dependency replacement approval copy in every locale', () => {
    const keys = [
      'workspace.branch-workspace.approval.replace-repository-dependencies',
      'workspace.branch-workspace.step.replace-repository-dependency',
      'workspace.branch-workspace.repository-dependency-conflict-changed',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.approval.replace-repository-dependencies']).toBe(
      '删除并重新写入列出的仓库依赖',
    )
  })

  test('distinguishes internal and external terminal actions in every dictionary', () => {
    expect(en['terminal.internal']).toBe('Internal terminal')
    expect(en['terminal.external']).toBe('External terminal')
    expect(zh['terminal.internal']).toBe('内部终端')
    expect(zh['terminal.external']).toBe('外部终端')
    expect(ja['terminal.internal']).toBe('内部ターミナル')
    expect(ja['terminal.external']).toBe('外部ターミナル')
    expect(ko['terminal.internal']).toBe('내부 터미널')
    expect(ko['terminal.external']).toBe('외부 터미널')
  })

  test('includes terminal focus copy in every dictionary', () => {
    const keys = ['terminal.focus', 'terminal.exit-focus'] as const
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['terminal.focus']).toBe('最大化终端')
    expect(zh['terminal.exit-focus']).toBe('退出终端最大化')
  })

  test('includes discard selected changes copy', () => {
    expect(en['changes.selection-toggle']).toBe('Select')
    expect(en['changes.selection-toggle-title']).toBe('Show selection checkboxes')
    expect(en['changes.discard-selected']).toBe('Discard selected')
    expect(en['changes.selected-count']).toBe('{count} selected')
    expect(en['changes.discard-confirm-file-title']).toBe('Discard changes to this file?')
    expect(en['changes.discard-confirm-folder-title']).toBe('Discard changes in this folder?')
    expect(en['changes.discard-confirm-multiple-title']).toBe('Discard changes to {count} selected items?')
    expect(en['changes.discard-confirm-body']).toContain('staged, unstaged, and untracked')
    expect(en['changes.discard-confirm-confirm']).toBe('Discard')
  })

  test('includes one-time worktree bootstrap candidate copy in every dictionary', () => {
    const keys = [
      'action.create-worktree-bootstrap-candidates-label',
      'action.create-worktree-bootstrap-candidates-description',
      'action.create-worktree-bootstrap-candidate-skip',
      'action.create-worktree-bootstrap-candidate-copy',
      'action.create-worktree-bootstrap-candidate-symlink',
      'action.create-worktree-bootstrap-preflight-error',
      'error.worktree-bootstrap-selection-stale',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
  })

  test('includes file tree text content shortcut copy in every dictionary', () => {
    const keys = [
      'file-tree.new-file',
      'file-tree.new-file-input-label',
      'file-tree.copy-file-contents-ok',
      'file-tree.replace-file-contents-ok',
      'error.file-tree-text-file-too-large',
      'error.file-tree-binary-file',
      'error.file-tree-not-regular-file',
      'error.file-tree-clipboard-unsupported-content',
    ] satisfies DictKey[]

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) {
        expect(dict[key], `${lang}.${key}`).toBeTruthy()
      }
    }
  })

  test('includes file area collapse copy in every dictionary', () => {
    const keys = ['file-area.collapse', 'file-area.expand'] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) {
        expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
      }
    }
  })

  test('includes bundled font license copy in every dictionary', () => {
    const keys = [
      'about.third-party-licenses',
      'about.third-party-licenses.body',
      'about.third-party-licenses.open',
      'about.third-party-licenses.dialog-title',
      'about.third-party-licenses.dialog-description',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) {
        expect(dict[key], `${lang}.${key}`).toBeTruthy()
      }
    }
  })

  test('uses Hobgoblin in user-visible product copy', () => {
    for (const [lang, dict] of Object.entries(dicts)) {
      expect(dict['about.app'], `${lang}.about.app`).toBe('Hobgoblin')
      expect(
        dict['settings.general.open-from-terminal-command'],
        `${lang}.settings.general.open-from-terminal-command`,
      ).toBe('open -b hobgoblin.app /path/to/repo')

      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${lang}.${key}`).not.toContain('Goblin')
        expect(value, `${lang}.${key}`).not.toMatch(/(^|[^a-z])goblin\.app\b/)
      }
    }
  })
})
