import { describe, expect, test } from 'vitest'
import { DICTS } from '#/shared/i18n/dictionaries.ts'
import {
  createDefaultTerminalCustomButtons,
  resolveTerminalCustomButtonPreset,
} from '#/shared/terminal-custom-button-presets.ts'

const expectedCopy = {
  en: [
    ['Confirm, continue', 'Confirm and continue'],
    ['Try if needed', 'Try it if needed'],
    ['Progress', 'What is the current progress?'],
    [
      'Decide autonomously',
      'Confirmed. Make decisions autonomously and execute the plan inline. Defer anything requiring my confirmation until the end.',
    ],
    ['Commit, push', 'Generate the commit message, commit the changes, and push them to the remote.'],
    [
      'Merge and release',
      'Merge into main, create a tag, generate an English release description, create a new release, and update Pages.',
    ],
    [
      'Batch operations',
      "1. Pull and update the current repository's source branch. 2. Batch-merge it into the current branch.",
    ],
  ],
  zh: [
    ['确认、继续', '确认、继续'],
    ['试试、需要', '试试 需要'],
    ['进度', '现在进度如何'],
    ['自主决策', '确认 自主决策并且使用inline的方式执行计划,需要我确认的留到最后'],
    ['提交、推送', '生成提交内容，提交，并且推送到远程'],
    ['提推合发更', '合并进入main,生成tag, 生成release 英文描述，生成新的release, 更新pages'],
    ['批量操作', '1.拉取、更新当前仓库的来源分支，2.批量合入到当前分支内'],
  ],
  ja: [
    ['確認・続行', '確認して続行してください'],
    ['必要なら試す', '必要なら試してみてください'],
    ['進捗', '現在の進捗はどうなっていますか'],
    [
      '自律判断',
      '確認しました。自律的に判断し、inline方式で計画を実行してください。私の確認が必要な項目は最後にまとめてください。',
    ],
    ['コミット・プッシュ', 'コミット内容を生成し、コミットしてリモートへプッシュしてください。'],
    [
      'マージ・リリース',
      'main にマージし、tag を生成し、英語の release 説明を生成して新しい release を作成し、Pages を更新してください。',
    ],
    ['一括操作', '1. 現在のリポジトリの元ブランチをプルして更新する。2. 現在のブランチへ一括でマージする。'],
  ],
  ko: [
    ['확인·계속', '확인하고 계속 진행해 주세요'],
    ['필요하면 시도', '필요하면 시도해 주세요'],
    ['진행 상황', '현재 진행 상황이 어떻게 되나요?'],
    [
      '자율 결정',
      '확인했습니다. 자율적으로 결정하고 inline 방식으로 계획을 실행해 주세요. 제 확인이 필요한 항목은 마지막에 모아 주세요.',
    ],
    ['커밋·푸시', '커밋 내용을 생성하고 커밋한 다음 원격에 푸시해 주세요.'],
    [
      '병합·릴리스',
      'main에 병합하고 tag를 생성한 뒤 영어 release 설명과 새 release를 만들고 Pages를 업데이트해 주세요.',
    ],
    ['일괄 작업', '1. 현재 리포지토리의 원본 브랜치를 풀하여 업데이트합니다. 2. 현재 브랜치에 일괄 병합합니다.'],
  ],
} as const

describe('terminal custom button presets', () => {
  test('creates exactly the seven approved presets in order', () => {
    expect(createDefaultTerminalCustomButtons().map(({ presetId, action }) => ({ presetId, action }))).toEqual([
      { presetId: 'confirm-continue', action: 'execute' },
      { presetId: 'try-if-needed', action: 'execute' },
      { presetId: 'show-progress', action: 'execute' },
      { presetId: 'autonomous-decisions', action: 'execute' },
      { presetId: 'commit-and-push', action: 'input' },
      { presetId: 'ship-release', action: 'input' },
      { presetId: 'batch-operations', action: 'input' },
    ])
  })

  test('resolves every preset in every supported language', () => {
    for (const lang of ['en', 'zh', 'ja', 'ko'] as const) {
      const resolved = createDefaultTerminalCustomButtons().map((button) =>
        resolveTerminalCustomButtonPreset(button, (key) => DICTS[lang][key]),
      )
      expect(
        resolved.map(({ label, value }) => [label, value]),
        lang,
      ).toEqual(expectedCopy[lang])
    }
  })

  test('uses English fallback copy when the translator has no preset key', () => {
    const resolved = createDefaultTerminalCustomButtons().map((button) =>
      resolveTerminalCustomButtonPreset(button, (key) => key),
    )

    expect(resolved.map(({ label, value }) => [label, value])).toEqual(expectedCopy.en)
  })

  test('preserves literal custom buttons and unknown preset ids', () => {
    const literal = { label: 'Status', value: 'git status', action: 'execute' as const }
    expect(resolveTerminalCustomButtonPreset(literal, (key) => key)).toBe(literal)

    const unknown = { ...literal, presetId: 'newer-version-id' as never }
    expect(resolveTerminalCustomButtonPreset(unknown, (key) => `translated:${key}`)).toBe(unknown)
  })
})
