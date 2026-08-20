import { useT } from '#/web/stores/i18n.ts'

export function BranchUpstreamDisplay({
  upstream,
  trackingGone = false,
}: {
  upstream: string | null
  trackingGone?: boolean
}) {
  const t = useT()
  return (
    <div className="grid min-w-0 gap-0.5 text-xs">
      <span className="text-muted-foreground">{t('action.branch-upstream-current')}</span>
      <span className="break-all font-mono text-foreground">
        {upstream ?? t('branches.no-upstream')}
        {trackingGone ? ` · ${t('action.branch-upstream-gone')}` : ''}
      </span>
    </div>
  )
}
