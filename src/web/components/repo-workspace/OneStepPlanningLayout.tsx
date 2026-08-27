import type { ReactNode } from 'react'
import { cn } from '#/web/lib/cn.ts'

interface OneStepPlanningLayoutProps {
  enabled: boolean
  testIdPrefix: string
  children: ReactNode
  presentation?: OneStepPlanningPresentation
  tone?: OneStepPlanningTone
}

interface OneStepPlanningPaneProps extends OneStepPlanningLayoutProps {
  title: string
  description?: string
  step?: string
}

export type OneStepPlanningPresentation = 'plain' | 'operation-console'
export type OneStepPlanningTone = 'constructive' | 'destructive'

export function OneStepPlanningLayout({
  enabled,
  testIdPrefix,
  children,
  presentation = 'plain',
  tone,
}: OneStepPlanningLayoutProps) {
  return (
    <div
      data-testid={enabled ? `${testIdPrefix}-one-step-layout` : undefined}
      data-presentation={enabled ? presentation : undefined}
      data-tone={enabled && presentation === 'operation-console' ? tone : undefined}
      className={cn(
        !enabled && 'contents',
        enabled &&
          presentation === 'plain' &&
          'grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
        enabled &&
          presentation === 'operation-console' &&
          'grid min-h-0 gap-0 overflow-x-hidden overflow-y-auto rounded-lg border bg-card lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:overflow-visible',
        enabled && presentation === 'operation-console' && tone === 'constructive' && 'border-success-border/70',
        enabled && presentation === 'operation-console' && tone === 'destructive' && 'border-danger-border/70',
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
  tone,
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
          <OneStepPlanningPaneHeader title={title} description={description} step={step} tone={tone} />
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
  tone,
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
          'grid min-w-0 content-start gap-3 border-t bg-muted/10 p-3 sm:p-4 lg:max-h-[65vh] lg:overflow-y-auto lg:border-t-0 lg:border-l',
      )}
    >
      {enabled ? (
        presentation === 'operation-console' ? (
          <OneStepPlanningPaneHeader title={title} description={description} step={step} tone={tone} />
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
  tone,
}: Pick<OneStepPlanningPaneProps, 'title' | 'description' | 'step' | 'tone'>) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {step ? (
        <span
          data-one-step-planning-step={step}
          aria-hidden="true"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-semibold',
            tone === 'constructive' && 'border-success-border bg-success-surface text-success',
            tone === 'destructive' && 'border-danger-border bg-danger-surface text-danger',
          )}
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
