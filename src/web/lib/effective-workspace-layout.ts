import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import type { WorkspaceLayout } from '#/shared/workspace-layout.ts'

/**
 * 根据响应式 UI 模式返回固定的工作区布局。
 * - compact 模式（移动设备）→ top-bottom（上下布局）
 * - default 模式（桌面设备）→ left-right（左右布局）
 */
export function useEffectiveWorkspaceLayout(): WorkspaceLayout {
  const uiMode = useResponsiveUiMode()
  return uiMode === 'compact' ? 'top-bottom' : 'left-right'
}
