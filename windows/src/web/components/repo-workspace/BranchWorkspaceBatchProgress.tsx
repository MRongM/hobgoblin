import { Circle, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import type {
  BranchWorkspaceBatchProgress as Progress,
  BranchWorkspaceBatchStepStatus,
} from './branch-workspace-batch-progress.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

interface Props {
  progress: Progress
}

export function BranchWorkspaceBatchProgress({ progress }: Props) {
  const t = useT()
  if (progress.totalCount === 0) return null
  return (
    <div
      data-testid="branch-workspace-batch-progress"
      className="grid gap-2 rounded-md border border-app-region-border bg-app-region/60 p-3 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('workspace.branch-workspace.git-action.progress')}</span>
        <span className="tabular-nums text-muted-foreground">
          {t('workspace.branch-workspace.progress.summary', {
            completed: progress.completedCount,
            total: progress.totalCount,
          })}
        </span>
      </div>
      <ul className="grid gap-1.5">
        {progress.members
          .filter((member) => member.selected)
          .map((member, memberIndex) => (
            <li
              key={member.repositoryName}
              data-merge-repository-progress={member.repositoryName}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {String(memberIndex + 1).padStart(2, '0')}
              </span>
              <span className="truncate font-mono">{member.repositoryName}</span>
              <span
                data-batch-member-status={member.repositoryName}
                data-status={member.status}
                className={cn(
                  'rounded-full border px-1.5 py-0.5 text-[10px]',
                  member.status === 'active' && 'border-brand-border text-brand-foreground',
                  member.status === 'complete' && 'border-success-border bg-success-surface text-success',
                  member.status === 'failed' && 'border-destructive/60 text-destructive',
                  member.status === 'pending' && 'border-app-region-border text-muted-foreground',
                )}
              >
                {t(`workspace.branch-workspace.progress.${member.status}`)}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {member.steps.map((step, index) => (
                  <span
                    key={`${member.repositoryName}:${step.step}:${index}`}
                    data-merge-step={`${member.repositoryName}:${step.step}`}
                    data-status={step.status}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]',
                      step.status === 'active' && 'border-brand-border text-brand-foreground',
                      step.status === 'complete' && 'border-success-border bg-success-surface text-success',
                      step.status === 'failed' && 'border-destructive/60 text-destructive',
                      step.status === 'pending' && 'border-app-region-border text-muted-foreground',
                    )}
                  >
                    <StepIcon status={step.status} />
                    {t(`workspace.branch-workspace.git-action.failure-step.${step.step}`)}
                  </span>
                ))}
              </div>
            </li>
          ))}
      </ul>
    </div>
  )
}

function StepIcon({ status }: { status: BranchWorkspaceBatchStepStatus }) {
  if (status === 'active') return <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
  if (status === 'complete') return <CircleCheck className="size-3" aria-hidden="true" />
  if (status === 'failed') return <CircleX className="size-3" aria-hidden="true" />
  return <Circle className="size-3" aria-hidden="true" />
}
