import type { WorkspaceLayout } from '#/shared/workspace-layout.ts'

/**
 * 返回唯一的可持久化工作区布局。
 * 紧凑模式使用独立的单焦点页面状态，不再映射成另一种分屏布局。
 */
export function useEffectiveWorkspaceLayout(): WorkspaceLayout {
  return 'left-right'
}
