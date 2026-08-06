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
    expect(zh['action.merge-in-and-push-confirm']).toBe('拉取、合并入并推送')
  })

  test('localizes inline AI commit and push automation in every dictionary', () => {
    expect(en['action.commit-auto-commit-and-push']).toBe('Commit and push after generating')
    expect(zh['action.commit-auto-commit-and-push']).toBe('生成后提交并推送')
    expect(ja['action.commit-auto-commit-and-push']).toBe('生成後にコミットしてプッシュ')
    expect(ko['action.commit-auto-commit-and-push']).toBe('생성 후 커밋하고 푸시')
  })

  test('localizes every built-in terminal button preset', () => {
    const ids = [
      'confirm-continue',
      'try-if-needed',
      'show-progress',
      'autonomous-decisions',
      'commit-and-push',
      'ship-release',
      'batch-operations',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const id of ids) {
        expect(dict[`terminal.custom-button-presets.${id}.label` as DictKey], `${lang}.${id}.label`).toBeTruthy()
        expect(dict[`terminal.custom-button-presets.${id}.value` as DictKey], `${lang}.${id}.value`).toBeTruthy()
      }
    }

    expect(ids.map((id) => en[`terminal.custom-button-presets.${id}.label` as DictKey])).toEqual([
      'Confirm, continue',
      'Try if needed',
      'Progress',
      'Decide autonomously',
      'Commit, push',
      'Merge and release',
      'Batch operations',
    ])
    expect(ids.map((id) => zh[`terminal.custom-button-presets.${id}.label` as DictKey])).toEqual([
      '确认、继续',
      '试试、需要',
      '进度',
      '自主决策',
      '提交、推送',
      '提推合发更',
      '批量操作',
    ])
    expect(ids.map((id) => ja[`terminal.custom-button-presets.${id}.label` as DictKey])).toEqual([
      '確認・続行',
      '必要なら試す',
      '進捗',
      '自律判断',
      'コミット・プッシュ',
      'マージ・リリース',
      '一括操作',
    ])
    expect(ids.map((id) => ko[`terminal.custom-button-presets.${id}.label` as DictKey])).toEqual([
      '확인·계속',
      '필요하면 시도',
      '진행 상황',
      '자율 결정',
      '커밋·푸시',
      '병합·릴리스',
      '일괄 작업',
    ])
  })

  test('uses direction-specific repository merge copy in every locale', () => {
    const keys = [
      'action.merge-in',
      'action.merge-in-title',
      'action.merge-in-label',
      'action.merge-in-placeholder',
      'action.merge-in-confirm',
      'action.merge-in-and-push-confirm',
      'action.merge-out',
      'action.merge-out-title',
      'action.merge-out-source-label',
      'action.merge-out-destination-label',
      'action.merge-out-destination-placeholder',
      'action.merge-out-destination-dirty',
      'action.merge-out-destination-unavailable',
      'action.merge-out-destination-upstream-required',
      'action.merge-out-loading',
      'action.merge-out-confirm',
      'action.merge-out-pull-merge-push-confirm',
      'error.merge-out-source-dirty',
      'error.merge-out-source-worktree-unavailable',
      'error.merge-out-destination-dirty',
      'error.merge-out-destination-worktree-unavailable',
      'error.merge-out-destination-upstream-required',
      'error.merge-out-plan-changed',
      'error.merge-out-temporary-worktree-unavailable',
    ] as const satisfies readonly DictKey[]

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['action.merge-in']).toBe('合并入')
    expect(zh['action.merge-out']).toBe('合并出')
    expect(en['action.merge-in']).toContain('into this branch')
    expect(en['action.merge-out']).toContain('this branch into')
  })

  test('uses detection copy for local branch and status refreshes', () => {
    expect(zh['action.fetch-local-title']).toBe('检测分支和状态')
  })

  test('distinguishes Chinese destructive branch actions', () => {
    expect(zh['action.remove-worktree']).toBe('删除工作树')
    expect(zh['action.delete-branch']).toBe('删除分支')
  })

  test('includes host tmux inventory and selected-close copy in every locale', () => {
    const keys = [
      'tmux.host-inventory.action',
      'tmux.host-inventory.none',
      'tmux.host-inventory.preview-failed',
      'tmux.host-inventory.execute-failed',
      'tmux.host-inventory.title',
      'tmux.host-inventory.description',
      'tmux.host-inventory.select-session',
      'tmux.host-inventory.terminal-number',
      'tmux.host-inventory.default-session',
      'tmux.host-inventory.open-external',
      'tmux.host-inventory.open-failed',
      'tmux.host-inventory.open-missing',
      'tmux.host-inventory.detached',
      'tmux.host-inventory.attached',
      'tmux.host-inventory.warning',
      'tmux.host-inventory.close-selected',
      'tmux.host-inventory.partial',
      'tmux.host-inventory.success',
      'tmux.host-inventory.missing',
      'error.tmux-invalid-socket-directory',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['tmux.host-inventory.action']).toBe('扫描主机 tmux 会话')
    expect(zh['tmux.host-inventory.close-selected']).toContain('关闭所选会话')
    expect(zh['tmux.host-inventory.none']).not.toContain('Hobgoblin')
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

  test('includes branch workspace lifecycle progress copy in every locale', () => {
    const keys = [
      'workspace.branch-workspace.progress.create',
      'workspace.branch-workspace.progress.remove',
      'workspace.branch-workspace.progress.summary',
      'workspace.branch-workspace.progress.pending',
      'workspace.branch-workspace.progress.active',
      'workspace.branch-workspace.progress.complete',
      'workspace.branch-workspace.progress.failed',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.progress.summary']).toBe('已完成 {completed}/{total}')
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

  test('includes worktree creation source and synchronization copy in every locale', () => {
    const keys = [
      'workspace.branch-workspace.repositories-select-all',
      'workspace.branch-workspace.creation-base-local',
      'workspace.branch-workspace.creation-base-remote',
      'workspace.branch-workspace.sync-before-create',
      'workspace.branch-workspace.sync-before-create-named',
      'workspace.branch-workspace.sync-no-upstream',
      'workspace.branch-workspace.existing-target-used',
      'workspace.branch-workspace.remote-branches-loading',
      'workspace.branch-workspace.remote-branches-error',
      'workspace.branch-workspace.preview-source-local',
      'workspace.branch-workspace.preview-source-remote',
      'workspace.branch-workspace.preview-source-existing-target',
      'workspace.branch-workspace.preview-sync-enabled',
      'workspace.branch-workspace.preview-sync-disabled',
      'action.create-worktree-sync-before-create',
      'action.create-worktree-sync-no-upstream',
      'error.worktree-sync-unavailable',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.sync-before-create']).toBe('创建前同步')
    expect(zh['workspace.branch-workspace.creation-base-remote']).toContain('远程分支')
  })

  test('uses the agreed branch workspace terminology in Chinese product copy', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value, key).not.toContain('子仓库')
    }
    expect(en['workspace.branch-workspace.member.open-worktree']).toBe('Open this member worktree')
    expect(zh['workspace.branch-workspace.member.open-worktree']).toBe('打开此成员工作树')
  })

  test('uses concise branch workspace member badge copy in every locale', () => {
    expect(en['workspace.branch-workspace.member-badge']).toBe('branch workspace')
    expect(zh['workspace.branch-workspace.member-badge']).toBe('子工作区')
    expect(ja['workspace.branch-workspace.member-badge']).toBe('ブランチワークスペース')
    expect(ko['workspace.branch-workspace.member-badge']).toBe('브랜치 워크스페이스')
  })

  test('localizes selectable branch workspace batch merge directions in every locale', () => {
    const keys = [
      'workspace.branch-workspace.git-action.batch-merge-in',
      'workspace.branch-workspace.git-action.batch-merge-in-description',
      'workspace.branch-workspace.git-action.batch-merge-out',
      'workspace.branch-workspace.git-action.batch-merge-out-description',
      'workspace.branch-workspace.git-action.selected-count',
      'workspace.branch-workspace.git-action.select-member',
      'workspace.branch-workspace.git-action.not-selected',
      'workspace.branch-workspace.git-action.progress',
      'workspace.branch-workspace.git-action.source-branch',
      'workspace.branch-workspace.git-action.select-source',
      'workspace.branch-workspace.git-action.source-branch-required',
      'workspace.branch-workspace.git-action.destination-branch',
      'workspace.branch-workspace.git-action.select-destination',
      'workspace.branch-workspace.git-action.destination-branch-required',
      'workspace.branch-workspace.git-action.temporary-worktree',
      'workspace.branch-workspace.git-action.destination-worktree-dirty',
      'workspace.branch-workspace.git-action.destination-worktree-unavailable',
      'workspace.branch-workspace.git-action.destination-upstream-required',
      'workspace.branch-workspace.git-action.merge-in',
      'workspace.branch-workspace.git-action.pull-merge-in-push',
      'workspace.branch-workspace.git-action.merge-out',
      'workspace.branch-workspace.git-action.pull-merge-out-push',
      'workspace.branch-workspace.git-action.step.prepare',
      'workspace.branch-workspace.git-action.step.cleanup',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(en['workspace.branch-workspace.git-action.batch-merge-in']).toBe('Batch merge in')
    expect(en['workspace.branch-workspace.git-action.batch-merge-out']).toBe('Batch merge out')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-in']).toBe('批量合入')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-out']).toBe('批量合出')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-in-description']).toContain('成员工作树')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-in-description']).toContain('来源分支')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-out-description']).toContain('目标分支')
    expect(zh['workspace.branch-workspace.git-action.batch-merge-out-description']).not.toContain('基准分支')
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

  test('localizes branch workspace reload and remote read failures in every locale', () => {
    const keys = [
      'workspace.branch-workspace.reload',
      'workspace.branch-workspace.remote-operation-failed',
      'workspace.branch-workspace.remote-invalid-response',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['workspace.branch-workspace.reload']).toBe('重新加载子工作区')
  })

  test('localizes scheduled status refresh settings in every locale', () => {
    const keys = ['settings.group.status-refresh', 'settings.status-refresh', 'settings.status-refresh-hint'] as const
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['settings.group.status-refresh']).toBe('状态刷新')
    expect(zh['settings.status-refresh']).toBe('定时刷新改动')
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
      'workspace.branch-workspace.dependency.add.replaces-target',
      'workspace.branch-workspace.dependency.add.replace-confirm',
      'workspace.branch-workspace.dependency.remove.title',
      'workspace.branch-workspace.dependency.remove.description',
      'workspace.branch-workspace.dependency.remove.available',
      'workspace.branch-workspace.dependency.remove.available-description',
      'workspace.branch-workspace.dependency.remove.empty',
      'workspace.branch-workspace.dependency.remove.confirm',
      'workspace.branch-workspace.dependency.preview-title',
      'workspace.branch-workspace.dependency.operation.add',
      'workspace.branch-workspace.dependency.operation.replace',
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

  test('includes transient one-time dependency warning copy in every locale', () => {
    const key = 'workspace.branch-workspace.dependency-warning' as const
    for (const [lang, dict] of Object.entries(dicts)) {
      expect(dict[key], `${lang}.${key}`).toContain('{count}')
    }
    expect(zh[key]).toContain('子工作区已成功创建')
  })

  test('identifies repository dependency sources in every locale', () => {
    const keys = [
      'worktree-bootstrap.source-primary',
      'worktree-bootstrap.source-branch',
      'worktree-bootstrap.source-select',
      'worktree-bootstrap.source-primary-option',
    ] as const

    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(en['worktree-bootstrap.source-branch']).toContain('{branch}')
    expect(zh['worktree-bootstrap.source-primary']).toContain('主工作树')
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

  test('localizes the Mobile Web terminal command deck in every dictionary', () => {
    const keys = [
      'terminal.command-deck',
      'terminal.command-deck.scroll-to-bottom',
      'terminal.command-deck.page-up',
      'terminal.command-deck.page-down',
      'terminal.command-deck.previous-terminal',
      'terminal.command-deck.next-terminal',
      'terminal.command-deck.compose',
      'terminal.command-deck.hide-compose',
      'terminal.command-deck.original-width',
      'terminal.command-deck.fit-width',
      'terminal.command-deck.focus',
      'terminal.command-deck.exit-focus',
      'terminal.command-deck.input-placeholder',
      'terminal.command-deck.send',
      'terminal.mobile-scroll-scrubber',
      'terminal.selection-copy-failed',
    ] as const
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const key of keys) expect(dict[key as keyof typeof dict], `${lang}.${key}`).toBeTruthy()
    }
    expect(zh['terminal.command-deck.compose' as keyof typeof zh]).toBe('命令输入')
    expect(zh['terminal.command-deck.scroll-to-bottom' as keyof typeof zh]).toBe('回到底部')
    expect(zh['terminal.command-deck.page-up' as keyof typeof zh]).toBe('向上翻页')
    expect(zh['terminal.command-deck.page-down' as keyof typeof zh]).toBe('向下翻页')
    expect(zh['terminal.command-deck.fit-width' as keyof typeof zh]).toBe('适应宽度')
    expect(zh['terminal.command-deck.focus' as keyof typeof zh]).toBe('专注模式')
    expect(zh['terminal.command-deck.exit-focus' as keyof typeof zh]).toBe('退出专注模式')
    expect(zh['terminal.mobile-scroll-scrubber' as keyof typeof zh]).toBe('拖动浏览终端历史')
    expect(zh['terminal.selection-copy-failed' as keyof typeof zh]).toBe('无法复制所选终端文本，请重试')
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
