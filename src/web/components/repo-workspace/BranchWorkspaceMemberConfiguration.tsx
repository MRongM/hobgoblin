import { useId } from 'react'
import type { BranchWorkspaceMemberKind, BranchWorkspaceMemberSource } from '#/shared/branch-workspaces.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { useT } from '#/web/stores/i18n.ts'

export type MemberCheckoutMode = 'auto' | 'newBranch' | 'existingBranch' | 'trackRemoteBranch' | 'detached'

interface Props {
  name: string
  sources: { id: string; name: string; available: boolean }[]
  kind: BranchWorkspaceMemberKind
  source: BranchWorkspaceMemberSource
  directory: string
  targetBranch: string
  checkoutMode: MemberCheckoutMode
  refValue: string
  branches?: string[]
  disabled: boolean
  onKindChange: (kind: BranchWorkspaceMemberKind) => void
  onSourceChange: (repositoryId: string) => void
  onUrlChange: (url: string) => void
  onDirectoryChange: (directory: string) => void
  onBranchChange: (branch: string) => void
  onCheckoutModeChange: (mode: MemberCheckoutMode) => void
  onRefChange: (ref: string) => void
  onAddAlias?: () => void
}

export function BranchWorkspaceMemberConfiguration(props: Props) {
  const t = useT()
  const branchListId = useId()
  const { name, disabled, source, checkoutMode } = props
  const selectClass = 'h-8 min-w-0 rounded-md border border-input bg-background px-2'
  return (
    <div className="grid gap-2 sm:col-span-4 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-xs">
        {t('workspace.branch-workspace.member-mode')}
        <select
          data-member-kind
          aria-label={t('workspace.branch-workspace.member-mode-named', { name })}
          className={selectClass}
          value={props.kind}
          disabled={disabled || source.kind === 'url'}
          onChange={(event) => props.onKindChange(event.target.value as BranchWorkspaceMemberKind)}
        >
          <option value="worktree">{t('workspace.branch-workspace.member-mode.worktree')}</option>
          <option value="repository">{t('workspace.branch-workspace.member-mode.repository')}</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-xs">
        {t('workspace.branch-workspace.member-source')}
        {source.kind === 'url' ? (
          <Input
            data-member-url
            aria-label={t('workspace.branch-workspace.member-url-named', { name })}
            value={source.url}
            disabled={disabled}
            placeholder="https://example.com/team/repository.git"
            onChange={(event) => props.onUrlChange(event.target.value)}
          />
        ) : (
          <select
            data-member-source
            aria-label={t('workspace.branch-workspace.member-source-named', { name })}
            className={selectClass}
            value={source.repositoryId}
            disabled={disabled}
            onChange={(event) => props.onSourceChange(event.target.value)}
          >
            {props.sources.map((repository) => (
              <option key={repository.id} value={repository.id} disabled={!repository.available}>
                {repository.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="grid min-w-0 gap-1 text-xs">
        {t('workspace.branch-workspace.member-directory')}
        <Input
          data-member-directory
          aria-label={t('workspace.branch-workspace.member-directory-named', { name })}
          value={props.directory}
          disabled={disabled}
          onChange={(event) => props.onDirectoryChange(event.target.value)}
        />
      </label>
      <label className="grid min-w-0 gap-1 text-xs">
        {t('workspace.branch-workspace.member-checkout-mode')}
        <select
          data-member-checkout-mode
          aria-label={t('workspace.branch-workspace.member-checkout-mode-named', { name })}
          className={selectClass}
          value={checkoutMode}
          disabled={disabled}
          onChange={(event) => props.onCheckoutModeChange(event.target.value as MemberCheckoutMode)}
        >
          <option value="auto">{t('workspace.branch-workspace.member-checkout-auto')}</option>
          <option value="newBranch">{t('action.create-worktree-mode-new')}</option>
          <option value="existingBranch">{t('action.create-worktree-mode-existing')}</option>
          <option value="trackRemoteBranch">{t('action.create-worktree-mode-remote')}</option>
          <option value="detached">{t('action.create-worktree-mode-detached')}</option>
        </select>
      </label>
      {checkoutMode !== 'detached' ? (
        <label className="grid min-w-0 gap-1 text-xs">
          {t('workspace.branch-workspace.member-target-branch')}
          <Input
            data-member-target-branch
            aria-label={t('workspace.branch-workspace.member-target-branch-named', { name })}
            value={props.targetBranch}
            disabled={disabled}
            list={branchListId}
            placeholder={
              source.kind === 'url' && checkoutMode === 'auto'
                ? t('workspace.branch-workspace.member-default-branch')
                : t('workspace.branch-workspace.member-target-branch')
            }
            onChange={(event) => props.onBranchChange(event.target.value)}
          />
          <datalist id={branchListId}>
            {props.branches?.map((branch) => (
              <option key={branch} value={branch} />
            ))}
          </datalist>
        </label>
      ) : null}
      {checkoutMode === 'detached' ||
      checkoutMode === 'trackRemoteBranch' ||
      (source.kind === 'url' && checkoutMode === 'newBranch') ? (
        <label className="grid min-w-0 gap-1 text-xs">
          {t(
            checkoutMode === 'detached'
              ? 'action.create-worktree-ref-label'
              : checkoutMode === 'newBranch'
                ? 'action.create-worktree-base-label'
                : 'action.pull-remote-branch-remote-label',
          )}
          <Input
            data-member-ref
            aria-label={t('workspace.branch-workspace.member-ref-named', { name })}
            value={props.refValue}
            disabled={disabled}
            onChange={(event) => props.onRefChange(event.target.value)}
          />
        </label>
      ) : null}
      {props.onAddAlias ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-add-member={name}
          disabled={disabled}
          onClick={props.onAddAlias}
        >
          {t('workspace.branch-workspace.member-add-alias')}
        </Button>
      ) : null}
    </div>
  )
}
