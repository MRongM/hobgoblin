import type { ReactNode } from 'react'
import { cn } from '#/web/lib/cn.ts'

interface OneStepPlanningLayoutProps {
  enabled: boolean
  testIdPrefix: string
  children: ReactNode
}

interface OneStepPlanningPaneProps extends OneStepPlanningLayoutProps {
  title: string
}

export function OneStepPlanningLayout({ enabled, testIdPrefix, children }: OneStepPlanningLayoutProps) {
  return (
    <div
      data-testid={enabled ? `${testIdPrefix}-one-step-layout` : undefined}
      className={cn(
        !enabled && 'contents',
        enabled &&
          'grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
      )}
    >
      {children}
    </div>
  )
}

export function OneStepPlanningSelectionPane({ enabled, testIdPrefix, title, children }: OneStepPlanningPaneProps) {
  return (
    <section
      data-testid={enabled ? `${testIdPrefix}-selection-pane` : undefined}
      className={cn(
        !enabled && 'contents',
        enabled && 'grid min-w-0 content-start gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1',
      )}
    >
      {enabled ? <h3 className="text-xs font-semibold">{title}</h3> : null}
      {children}
    </section>
  )
}

export function OneStepPlanningPlanPane({ enabled, testIdPrefix, title, children }: OneStepPlanningPaneProps) {
  return (
    <section
      data-testid={enabled ? `${testIdPrefix}-plan-pane` : undefined}
      aria-live={enabled ? 'polite' : undefined}
      className={cn(
        !enabled && 'contents',
        enabled && 'grid min-w-0 content-start gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pl-1',
      )}
    >
      {enabled ? <h3 className="text-xs font-semibold">{title}</h3> : null}
      {children}
    </section>
  )
}
