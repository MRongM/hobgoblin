// Top app bar with embedded tab strip. The .topbar CSS rule turns this into
// the OS drag region; child buttons opt out via -webkit-app-region: no-drag
// (set globally on `button` and any element with `data-interactive`).
// The ambient settings entry lives in the bottom status bar.

import type { ReactNode } from 'react'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'

interface Props {
  children: ReactNode
  actions?: ReactNode
}

export function Topbar({ children, actions }: Props) {
  const { topbarHeightPx } = useRuntimeChromeSettings()

  return (
    <div
      className="topbar mobile-topbar-scroll relative flex items-center gap-2 overflow-hidden border-b border-topbar-border bg-topbar text-sm text-topbar-foreground"
      style={{ height: topbarHeightPx }}
    >
      {children}
      {actions && (
        <div data-testid="topbar-actions" className="flex h-full shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
    </div>
  )
}
