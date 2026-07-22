import { describe, expect, test } from 'vitest'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'

describe('repoWorkspaceBehavior', () => {
  test('maximizes the terminal detail when focus state is true', () => {
    expect(repoWorkspaceBehavior('left-right', false, true)).toMatchObject({
      mode: 'focus',
      detailFocusAllowed: true,
      detailFocusMode: true,
      branchListActionsVisible: false,
    })
  })

  test('ignores collapse while preserving terminal focus in the fixed layout', () => {
    expect(repoWorkspaceBehavior('left-right', true, true)).toMatchObject({
      mode: 'focus',
      detailCollapsed: false,
      detailFocusMode: true,
      branchListActionsVisible: false,
    })
  })
})
