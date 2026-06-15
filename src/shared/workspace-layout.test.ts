import { describe, expect, test } from 'vitest'
import {
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_FILE_TREE_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
  normalizeWorkspaceSessionLayoutState,
} from '#/shared/workspace-layout.ts'

describe('normalizeWorkspaceSessionLayoutState', () => {
  test('defaults to left-right layout with the file tree taking two thirds', () => {
    expect(DEFAULT_WORKSPACE_LAYOUT).toBe('left-right')
    expect(DEFAULT_FILE_TREE_PANE_SIZES).toEqual({ 'top-bottom': 66.7, 'left-right': 66.7 })
  })

  test('disables detail focus mode and collapse when the layout does not support them', () => {
    expect(
      normalizeWorkspaceSessionLayoutState({
        workspaceLayout: 'left-right',
        detailCollapsed: true,
        detailFocusMode: true,
        detailPaneSizes: { 'top-bottom': 55, 'left-right': 45 },
        fileTreePaneSizes: { 'top-bottom': 44, 'left-right': 36 },
      }),
    ).toEqual({
      workspaceLayout: 'left-right',
      detailCollapsed: false,
      detailFocusMode: false,
      detailPaneSizes: { 'top-bottom': 55, 'left-right': 45 },
      fileTreePaneSizes: { 'top-bottom': 44, 'left-right': 36 },
    })
  })

  test('falls back to defaults for invalid input', () => {
    expect(
      normalizeWorkspaceSessionLayoutState({
        workspaceLayout: 'branches',
        detailCollapsed: 'yes',
        detailFocusMode: 'focus',
        detailPaneSizes: { 'top-bottom': 'bad' },
        fileTreePaneSizes: { 'left-right': 'bad' },
      }),
    ).toEqual({
      workspaceLayout: 'left-right',
      detailCollapsed: false,
      detailFocusMode: false,
      detailPaneSizes: DEFAULT_DETAIL_PANE_SIZES,
      fileTreePaneSizes: DEFAULT_FILE_TREE_PANE_SIZES,
    })
  })
})
