import type { ReactNode } from 'react'
import { cn } from '#/web/lib/cn.ts'

interface OneStepPlanningLayoutProps {
  enabled: boolean
  testIdPrefix: string
  children: ReactNode
  presentation?: OneStepPlanningPresentation
}

interface OneStepPlanningPaneProps extends OneStepPlanningLayoutProps {
  title: string
  description?: string
  step?: string
}

export type OneStepPlanningPresentation = 'plain' | 'operation-console'

export function OneStepPlanningLayout({
  enabled,
  testIdPrefix,
  children,
  presentation = 'plain',
}: OneStepPlanningLayoutProps) {
  return (
    <div
      data-testid={enabled ? `${testIdPrefix}-one-step-layout` : undefined}
      data-presentation={enabled ? presentation : undefined}
      className={cn(
        !enabled && 'contents',
        enabled &&
          presentation === 'plain' &&
          'grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
        enabled &&
          presentation === 'operation-console' &&
          'grid min-h-0 gap-0 overflow-x-hidden overflow-y-auto rounded-lg border border-separator bg-card lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
      )}
    >
      {children}
    </div>
  )
}

export function OneStepPlanningSelectionPane({
  enabled,
  testIdPrefix,
  title,
  description,
  step,
  children,
  presentation = 'plain',
}: OneStepPlanningPaneProps) {
  return (
    <section
      data-testid={enabled ? `${testIdPrefix}-selection-pane` : undefined}
      className={cn(
        !enabled && 'contents',
        enabled &&
          presentation === 'plain' &&
          'grid min-w-0 content-start gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1',
        enabled &&
          presentation === 'operation-console' &&
          'grid min-w-0 content-start gap-3 p-3 sm:p-4 lg:max-h-[65vh] lg:overflow-y-auto',
      )}
    >
      {enabled ? (
        presentation === 'operation-console' ? (
          <OneStepPlanningPaneHeader title={title} description={description} step={step} />
        ) : (
          <h3 className="text-xs font-semibold">{title}</h3>
        )
      ) : null}
      {children}
    </section>
  )
}

export function OneStepPlanningPlanPane({
  enabled,
  testIdPrefix,
  title,
  description,
  step,
  children,
  presentation = 'plain',
}: OneStepPlanningPaneProps) {
  return (
    <section
      data-testid={enabled ? `${testIdPrefix}-plan-pane` : undefined}
      aria-live={enabled ? 'polite' : undefined}
      className={cn(
        !enabled && 'contents',
        enabled &&
          presentation === 'plain' &&
          'grid min-w-0 content-start gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pl-1',
        enabled &&
          presentation === 'operation-console' &&
          'grid min-w-0 content-start gap-3 border-t p-3 sm:p-4 lg:max-h-[65vh] lg:overflow-y-auto lg:border-t-0 lg:border-l',
      )}
    >
      {enabled ? (
        presentation === 'operation-console' ? (
          <OneStepPlanningPaneHeader title={title} description={description} step={step} />
        ) : (
          <h3 className="text-xs font-semibold">{title}</h3>
        )
      ) : null}
      {children}
    </section>
  )
}

function OneStepPlanningPaneHeader({
  title,
  description,
  step,
}: Pick<OneStepPlanningPaneProps, 'title' | 'description' | 'step'>) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {step ? (
        <span
          data-one-step-planning-step={step}
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-md border border-separator bg-muted/20 font-mono text-[9px] font-semibold text-muted-foreground"
        >
          {step}
        </span>
      ) : null}
      <div className="grid min-w-0 gap-0.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {description ? <p className="text-[10px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}
