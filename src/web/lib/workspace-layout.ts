import { effectiveDetailCollapsed, workspaceLayoutAllowsDetailCollapse } from '#/shared/workspace-layout.ts'
import type { WorkspaceLayout } from '#/shared/workspace-layout.ts'
export type RepoWorkspaceMode = 'split' | 'collapsed' | 'focus'

export interface RepoWorkspaceBehavior {
  /** The actual rendered workspace layout mode after collapsing/focus rules
   *  are applied. Layout-specific UI placement should prefer this field. */
  mode: RepoWorkspaceMode
  detailCollapsed: boolean
  detailCollapseAllowed: boolean
  detailFocusAllowed: boolean
  /** Whether the terminal detail is currently maximized. */
  detailFocusMode: boolean
  branchListActionsVisible: boolean
  prTooltipSide: 'right' | 'bottom'
}

const REPO_WORKSPACE_BEHAVIOR = {
  'left-right': {
    branchListActionsVisible: true,
    prTooltipSide: 'bottom',
  },
} satisfies Record<
  WorkspaceLayout,
  Omit<
    RepoWorkspaceBehavior,
    'detailCollapsed' | 'detailCollapseAllowed' | 'detailFocusAllowed' | 'detailFocusMode' | 'mode'
  >
>

export function repoWorkspaceBehavior(
  layout: WorkspaceLayout,
  detailCollapsed: boolean,
  detailFocusMode = false,
): RepoWorkspaceBehavior {
  const detailCollapsedEffective = effectiveDetailCollapsed(layout, detailCollapsed)
  const detailFocusAllowed = true
  const detailFocusModeEffective = detailFocusAllowed && detailFocusMode
  const mode: RepoWorkspaceMode = detailFocusModeEffective
    ? 'focus'
    : detailCollapsedEffective
      ? 'collapsed'
      : 'split'
  const baseBehavior = REPO_WORKSPACE_BEHAVIOR[layout]
  return {
    ...baseBehavior,
    mode,
    detailCollapseAllowed: workspaceLayoutAllowsDetailCollapse(layout),
    detailFocusAllowed,
    detailFocusMode: detailFocusModeEffective,
    detailCollapsed: detailCollapsedEffective,
    branchListActionsVisible: baseBehavior.branchListActionsVisible && mode !== 'focus',
  }
}
