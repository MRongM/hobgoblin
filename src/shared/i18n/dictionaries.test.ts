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
    expect(zh['action.pull']).toBe('拉取')
    expect(zh['action.create-branch']).toBe('从本地新建分支')
    expect(zh['action.create-branch-title']).toBe('从本地新建分支')
    expect(zh['action.pull-remote-branch']).toBe('从远程新建分支')
    expect(zh['action.pull-remote-branch-title']).toBe('从远程分支创建本地分支')
  })

  test('distinguishes Chinese destructive branch actions', () => {
    expect(zh['action.remove-worktree']).toBe('删除工作树')
    expect(zh['action.delete-branch']).toBe('删除分支')
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

  test('includes file tree text content shortcut copy in every dictionary', () => {
    const keys = [
      'file-tree.new-file',
      'file-tree.new-file-input-label',
      'file-tree.copy-file-contents-ok',
      'file-tree.replace-file-contents-ok',
      'error.file-tree-text-file-too-large',
      'error.file-tree-binary-file',
      'error.file-tree-not-regular-file',
      'error.file-tree-clipboard-ambiguous-binary-format',
    ] satisfies DictKey[]

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
