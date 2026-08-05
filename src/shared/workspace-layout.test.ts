import { describe, expect, test } from 'vitest'
import {
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_FILE_TREE_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
  WORKSPACE_LAYOUTS,
  normalizeDetailPaneSizes,
  normalizeFileTreePaneSizes,
  normalizeWorkspaceLayout,
  normalizeWorkspaceSessionLayoutState,
} from '#/shared/workspace-layout.ts'

describe('normalizeWorkspaceSessionLayoutState', () => {
  test('defaults to left-right layout with the file tree taking two thirds', () => {
    expect(WORKSPACE_LAYOUTS).toEqual(['left-right'])
    expect(DEFAULT_WORKSPACE_LAYOUT).toBe('left-right')
    expect(DEFAULT_FILE_TREE_PANE_SIZES).toEqual({ 'left-right': 66.7 })
  })

  test('normalizes legacy top-bottom layout state to left-right while preserving terminal focus', () => {
    expect(normalizeWorkspaceLayout('top-bottom')).toBe('left-right')
    expect(normalizeDetailPaneSizes({ 'top-bottom': 55, 'left-right': 45 })).toEqual({ 'left-right': 45 })
    expect(normalizeFileTreePaneSizes({ 'top-bottom': 44, 'left-right': 36 })).toEqual({ 'left-right': 36 })
    expect(
      normalizeWorkspaceSessionLayoutState({
        workspaceLayout: 'top-bottom',
        detailCollapsed: true,
        detailFocusMode: true,
        detailPaneSizes: { 'top-bottom': 55, 'left-right': 45 },
        fileTreePaneSizes: { 'top-bottom': 44, 'left-right': 36 },
      }),
    ).toEqual({
      workspaceLayout: 'left-right',
      detailCollapsed: false,
      detailFocusMode: true,
      detailPaneSizes: { 'left-right': 45 },
      fileTreePaneSizes: { 'left-right': 36 },
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
