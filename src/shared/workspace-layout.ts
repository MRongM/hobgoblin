export const WORKSPACE_LAYOUTS = ['left-right'] as const

export type WorkspaceLayout = (typeof WORKSPACE_LAYOUTS)[number]
export type WorkspaceLayoutAxis = 'columns'
export type WorkspaceDetailPaneSizes = Record<WorkspaceLayout, number>

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = 'left-right'
export const DEFAULT_DETAIL_COLLAPSED = false
export const DEFAULT_DETAIL_FOCUS_MODE = false
// The detail pane owns the width — the sidebar (branch list + file area)
// stays narrow, roughly a quarter of the window.
export const DEFAULT_DETAIL_PANE_SIZES: WorkspaceDetailPaneSizes = { 'left-right': 74.2 }
export const DEFAULT_FILE_TREE_PANE_SIZES: WorkspaceDetailPaneSizes = { 'left-right': 66.7 }

export const MIN_WORKSPACE_PANE_SIZE = 10
export const MAX_WORKSPACE_PANE_SIZE = 90

const WORKSPACE_LAYOUT_META = {
  'left-right': { axis: 'columns', detailCollapseAllowed: false },
} satisfies Record<WorkspaceLayout, { axis: WorkspaceLayoutAxis; detailCollapseAllowed: boolean }>

export function normalizeWorkspaceLayout(_value: unknown): WorkspaceLayout {
  return DEFAULT_WORKSPACE_LAYOUT
}

export function workspaceLayoutAllowsDetailCollapse(layout: WorkspaceLayout): boolean {
  return WORKSPACE_LAYOUT_META[layout].detailCollapseAllowed
}

export function effectiveDetailCollapsed(layout: WorkspaceLayout, detailCollapsed: boolean): boolean {
  return workspaceLayoutAllowsDetailCollapse(layout) && detailCollapsed
}

function normalizePaneSize(layout: WorkspaceLayout, value: unknown, defaults: WorkspaceDetailPaneSizes): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaults[layout]
  return Math.max(MIN_WORKSPACE_PANE_SIZE, Math.min(MAX_WORKSPACE_PANE_SIZE, Math.round(value * 10) / 10))
}

function normalizePaneSizes(value: unknown, defaults: WorkspaceDetailPaneSizes): WorkspaceDetailPaneSizes {
  const sizes = value && typeof value === 'object' ? (value as Partial<Record<WorkspaceLayout, unknown>>) : {}
  return {
    'left-right': normalizePaneSize('left-right', sizes['left-right'], defaults),
  }
}

export function normalizeDetailPaneSize(layout: WorkspaceLayout, value: unknown): number {
  return normalizePaneSize(layout, value, DEFAULT_DETAIL_PANE_SIZES)
}

export function normalizeFileTreePaneSize(layout: WorkspaceLayout, value: unknown): number {
  return normalizePaneSize(layout, value, DEFAULT_FILE_TREE_PANE_SIZES)
}

export function normalizeDetailPaneSizes(value: unknown): WorkspaceDetailPaneSizes {
  return normalizePaneSizes(value, DEFAULT_DETAIL_PANE_SIZES)
}

export function normalizeFileTreePaneSizes(value: unknown): WorkspaceDetailPaneSizes {
  return normalizePaneSizes(value, DEFAULT_FILE_TREE_PANE_SIZES)
}

export function normalizeWorkspaceSessionLayoutState(value: {
  workspaceLayout?: unknown
  detailCollapsed?: unknown
  detailFocusMode?: unknown
  detailPaneSizes?: unknown
  fileTreePaneSizes?: unknown
}): {
  workspaceLayout: WorkspaceLayout
  detailCollapsed: boolean
  detailFocusMode: boolean
  detailPaneSizes: WorkspaceDetailPaneSizes
  fileTreePaneSizes: WorkspaceDetailPaneSizes
} {
  const workspaceLayout = normalizeWorkspaceLayout(value.workspaceLayout)
  const detailCollapsed = effectiveDetailCollapsed(
    workspaceLayout,
    typeof value.detailCollapsed === 'boolean' ? value.detailCollapsed : DEFAULT_DETAIL_COLLAPSED,
  )
  const detailFocusMode = DEFAULT_DETAIL_FOCUS_MODE
  return {
    workspaceLayout,
    detailCollapsed,
    detailFocusMode,
    detailPaneSizes: normalizeDetailPaneSizes(value.detailPaneSizes),
    fileTreePaneSizes: normalizeFileTreePaneSizes(value.fileTreePaneSizes),
  }
}
