import { describe, expect, test } from 'vitest'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'

describe('repoWorkspaceBehavior', () => {
  test('moves branch actions out of the list in top-bottom focus mode', () => {
    expect(repoWorkspaceBehavior('top-bottom', false, true)).toMatchObject({
      mode: 'focus',
      detailFocusMode: true,
      branchListActionsVisible: false,
    })
  })

  test('moves branch actions out of the list in left-right focus mode', () => {
    expect(repoWorkspaceBehavior('left-right', false, true)).toMatchObject({
      mode: 'focus',
      detailFocusAllowed: true,
      detailFocusMode: true,
      branchListActionsVisible: false,
    })
  })

  test('keeps branch list actions visible when focus preference is on but detail is collapsed', () => {
    expect(repoWorkspaceBehavior('top-bottom', true, true)).toMatchObject({
      mode: 'collapsed',
      detailFocusMode: true,
      branchListActionsVisible: true,
    })
    expect(repoWorkspaceBehavior('left-right', true, true)).toMatchObject({
      mode: 'collapsed',
      detailFocusMode: true,
      branchListActionsVisible: true,
    })
  })
})
