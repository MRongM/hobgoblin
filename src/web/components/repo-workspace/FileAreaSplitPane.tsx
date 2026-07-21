import type { ReactNode } from 'react'
import { SplitPane } from '#/web/components/SplitPane.tsx'

interface FileAreaSplitPaneProps {
  navigationArea: ReactNode
  fileArea: ReactNode
  fileAreaSize: number
  onFileAreaSizeChange?: (size: number) => void
  orientation: 'horizontal' | 'vertical'
  navigationMinSize?: number | string
  fileAreaMinSize?: number | string
  fileAreaMaxSize?: number | string
  fileAreaCollapsed?: boolean
  className?: string
  disabled?: boolean
}

export function FileAreaSplitPane({
  navigationArea,
  fileArea,
  fileAreaSize,
  onFileAreaSizeChange,
  orientation,
  navigationMinSize,
  fileAreaMinSize,
  fileAreaMaxSize,
  fileAreaCollapsed = false,
  className,
  disabled,
}: FileAreaSplitPaneProps) {
  return (
    <SplitPane
      orientation={orientation}
      before={navigationArea}
      after={fileArea}
      afterSize={fileAreaSize}
      onAfterSizeChange={onFileAreaSizeChange}
      beforeMinSize={navigationMinSize}
      afterMinSize={fileAreaMinSize}
      afterMaxSize={fileAreaMaxSize}
      afterCollapsed={fileAreaCollapsed}
      className={className}
      disabled={disabled}
    />
  )
}
