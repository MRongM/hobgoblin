// Single-page form for creating a linked worktree:
//   - Create a new branch from a local base.
//   - Check out an existing local branch without creating another branch.
//   - Create a local tracking branch from a remote-tracking branch.
//   - Create a detached worktree from a ref.
//
// Errors are surfaced raw from git: path already exists, branch checked out
// elsewhere, missing parent directory, etc. The renderer gates obvious branch
// and ref name problems up front; anything else stays git's responsibility.

import { useEffect, useRef, useState } from 'react'
import { GitBranch, GitBranchPlus, GitCommitHorizontal, RadioTower, type LucideIcon } from 'lucide-react'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldDescription, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { ToggleGroup, ToggleGroupItem } from '#/web/components/ui/toggle-group.tsx'
import { useRemotePathSuggestions } from '#/web/hooks/useRemotePathSuggestions.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'
import { WorktreeDependencyTree } from '#/web/components/WorktreeDependencyTree.tsx'
import { WorktreeBootstrapSourcePicker } from '#/web/components/WorktreeBootstrapSourcePicker.tsx'
import type { RepoState } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { defaultWorktreePath, formatWorktreePath, tildify, untildify } from '#/web/lib/paths.ts'
import { cn } from '#/web/lib/cn.ts'
import { validateBranchName } from '#/shared/refnames.ts'
import { isResolvableRemotePathInput } from '#/shared/remote-repo.ts'
import {
  deriveLocalBranchFromRemoteRef,
  isRemoteTrackingRef,
  type CreateWorktreeInput,
} from '#/shared/worktree-create.ts'
import { remoteRefMatchesQuery } from '#/web/components/branch-list/branch-create-model.ts'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

type CreateWorktreeDialogMode = CreateWorktreeInput['mode']['kind']

const MODE_OPTIONS = [
  { id: 'newBranch', labelKey: 'action.create-worktree-mode-new', icon: GitBranchPlus },
  { id: 'existingBranch', labelKey: 'action.create-worktree-mode-existing', icon: GitBranch },
  { id: 'trackRemoteBranch', labelKey: 'action.create-worktree-mode-remote', icon: RadioTower },
  { id: 'detached', labelKey: 'action.create-worktree-mode-detached', icon: GitCommitHorizontal },
] satisfies Array<{ id: CreateWorktreeDialogMode; labelKey: string; icon: LucideIcon }>

export interface CreateWorktreeRequest {
  input: CreateWorktreeInput
  selections: WorktreeBootstrapSelection[]
  sourceWorktreePath?: string
}

interface Props {
  open: boolean
  repo: RepoState
  defaultBranch?: string
  bootstrapEnabled?: boolean
  worktreeBootstrap?: WorktreeBootstrapPromptState
  onBootstrapEnabledChange?: (enabled: boolean) => void
  onBootstrapContextBranchChange?: (branch: string) => void
  onBootstrapSourceChange?: (source: RepositoryDependencySource) => void
  onClose: () => void
  onCreate: (request: CreateWorktreeRequest) => void | Promise<void>
}

interface WorktreeBootstrapPromptState {
  source?: RepositoryDependencySource
  sourceOptions?: readonly RepositoryDependencySource[]
}

export function CreateWorktreeDialog({
  open,
  repo,
  defaultBranch,
  bootstrapEnabled = false,
  worktreeBootstrap,
  onBootstrapEnabledChange,
  onBootstrapContextBranchChange,
  onBootstrapSourceChange,
  onClose,
  onCreate,
}: Props) {
  const t = useT()
  const compact = useIsCompactUi()

  const [mode, setMode] = useState<CreateWorktreeDialogMode>('newBranch')
  const [base, setBase] = useState<string>('')
  const [branch, setBranch] = useState('')
  const [existingBranch, setExistingBranch] = useState('')
  const [syncBeforeCreate, setSyncBeforeCreate] = useState(false)
  const [remoteRef, setRemoteRef] = useState('')
  const [localBranch, setLocalBranch] = useState('')
  const [detachedRef, setDetachedRef] = useState('')
  const [worktreePath, setWorktreePath] = useState('')
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [remoteBranchQuery, setRemoteBranchQuery] = useState('')
  const [remoteBranchesLoading, setRemoteBranchesLoading] = useState(false)
  const [bootstrapSelections, setBootstrapSelections] = useState<WorktreeBootstrapSelection[]>([])
  const [originatingBranch, setOriginatingBranch] = useState('')
  const localBranchNames = repo.data.branches.map((b) => b.name)
  const hasLocalBranch = (name: string) => localBranchNames.includes(name)

  // Reset on the rising edge of `open` only. Listing repo.data.branches /
  // repo.data.currentBranch in the deps would re-fire on every snapshot
  // refresh (incl. background refreshes) and wipe user input.
  // Snapshot the initial base via a ref so the open-edge handler
  // reads the current value without taking a dep on it.
  const initialBaseRef = useRef('')
  const fallbackBase = repo.data.currentBranch || repo.data.branches[0]?.name || ''
  initialBaseRef.current = defaultBranch && hasLocalBranch(defaultBranch) ? defaultBranch : fallbackBase
  useEffect(() => {
    if (!open) return
    const initialBase = initialBaseRef.current
    setMode('newBranch')
    setBase(initialBase)
    setBranch(defaultNewBranchName(initialBase))
    setExistingBranch(initialBase)
    setSyncBeforeCreate(canSynchronizeBranch(repo, initialBase))
    setRemoteRef('')
    setLocalBranch('')
    setDetachedRef('')
    setWorktreePath('')
    setRemoteBranches([])
    setRemoteBranchQuery('')
    setRemoteBranchesLoading(false)
    setBootstrapSelections([])
    setOriginatingBranch(initialBase)
  }, [open])

  const bootstrapContextBranch =
    mode === 'newBranch' ? base : mode === 'existingBranch' ? existingBranch : originatingBranch
  useEffect(() => {
    if (open && bootstrapContextBranch) onBootstrapContextBranchChange?.(bootstrapContextBranch)
  }, [bootstrapContextBranch, onBootstrapContextBranchChange, open])

  const bootstrapSourceId = worktreeBootstrap?.source?.id
  useEffect(() => {
    if (open) setBootstrapSelections([])
  }, [bootstrapSourceId, open])

  useEffect(() => {
    if (!bootstrapEnabled) setBootstrapSelections([])
  }, [bootstrapEnabled])

  useEffect(() => {
    if (!open || mode !== 'trackRemoteBranch' || remoteBranches.length > 0) return
    const ctrl = new AbortController()
    setRemoteBranchesLoading(true)
    void getRepositoryRemoteBranches(repo.id, ctrl.signal)
      .then((branches) => {
        if (ctrl.signal.aborted) return
        setRemoteBranches(branches)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRemoteBranches([])
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setRemoteBranchesLoading(false)
      })
    return () => ctrl.abort()
  }, [mode, open, remoteBranches.length, repo.id])

  const remoteTarget = repo.remote.target
  const visibleRemoteBranches = remoteBranches.filter((ref) => remoteRefMatchesQuery(ref, remoteBranchQuery))
  const branchTrimmed = branch.trim()
  const detachedRefTrimmed = detachedRef.trim()
  const visibleSelectedRemoteRef = remoteRef && visibleRemoteBranches.includes(remoteRef) ? remoteRef : ''
  const activeRemoteRef = visibleSelectedRemoteRef || visibleRemoteBranches[0] || ''
  const derivedLocalBranch = deriveLocalBranchFromRemoteRef(activeRemoteRef) ?? ''
  const trackLocalBranch = localBranch.trim() || derivedLocalBranch
  const pathName = worktreePathName({ mode, branchTrimmed, existingBranch, trackLocalBranch, detachedRefTrimmed })
  const pathTrimmed = remoteTarget ? worktreePath.trim() : untildify(worktreePath.trim())
  const defaultPath = remoteTarget
    ? defaultRemoteWorktreePath(remoteTarget.remotePath, pathName)
    : defaultWorktreePath(repo.id, pathName)
  const effectivePath = pathTrimmed || defaultPath
  const displayDefaultPath = remoteTarget ? formatWorktreePath(defaultPath, remoteTarget) : tildify(defaultPath)
  const displayEffectivePath = remoteTarget ? formatWorktreePath(effectivePath, remoteTarget) : tildify(effectivePath)

  const pathSuggestions = useRemotePathSuggestions({
    enabled: open && !!remoteTarget && pathName.length > 0,
    alias: remoteTarget?.alias ?? '',
    remotePath: remoteTarget?.remotePath ?? '/',
    prefix: worktreePath,
  })

  const branchValidation = branchTrimmed ? validateBranchName(branchTrimmed) : { ok: true }
  const localBranchValidation = trackLocalBranch ? validateBranchName(trackLocalBranch) : { ok: true }
  const detachedRefValidation = detachedRefTrimmed ? validateBranchName(detachedRefTrimmed) : { ok: true }
  const baseExists = base ? hasLocalBranch(base) : false
  const existingBranchExists = existingBranch ? hasLocalBranch(existingBranch) : false
  const branchExists = branchTrimmed ? hasLocalBranch(branchTrimmed) : false
  const trackLocalBranchExists = trackLocalBranch ? hasLocalBranch(trackLocalBranch) : false

  const baseError = mode === 'newBranch' && base && !baseExists ? t('action.create-worktree-base-missing') : ''
  const branchError =
    mode === 'newBranch' && branchTrimmed
      ? !branchValidation.ok
        ? t('action.create-worktree-branch-invalid')
        : branchExists
          ? t('action.create-worktree-branch-exists')
          : ''
      : ''
  const existingBranchError =
    mode === 'existingBranch' && existingBranch && !existingBranchExists
      ? t('action.create-worktree-existing-missing')
      : ''
  const localBranchError =
    mode === 'trackRemoteBranch' && trackLocalBranch
      ? !localBranchValidation.ok
        ? t('action.create-worktree-branch-invalid')
        : trackLocalBranchExists
          ? t('action.create-worktree-local-branch-exists')
          : ''
      : ''
  const detachedRefError =
    mode === 'detached' && detachedRefTrimmed && !detachedRefValidation.ok
      ? t('action.create-worktree-ref-invalid')
      : ''

  const branchActionBusy = repo.operations.branchAction.phase !== 'idle'
  const validPath = remoteTarget ? isResolvableRemotePathInput(effectivePath) : effectivePath.length > 0
  const input = buildInput()
  const canSubmit = !!input && validPath && !branchActionBusy

  useEffect(() => {
    if (!open || mode !== 'trackRemoteBranch') return
    const firstRemoteRef = remoteBranches[0] || ''
    if (!firstRemoteRef) {
      if (remoteRef) setRemoteRef('')
      if (localBranch) setLocalBranch('')
      return
    }
    if (!remoteRef || !remoteBranches.includes(remoteRef)) {
      setRemoteRef(firstRemoteRef)
      setLocalBranch('')
    }
  }, [localBranch, mode, open, remoteBranches, remoteRef])

  function buildInput(): CreateWorktreeInput | null {
    if (!validPath) return null
    switch (mode) {
      case 'newBranch':
        return branchTrimmed && !branchError && baseExists
          ? {
              worktreePath: effectivePath,
              mode: {
                kind: 'newBranch',
                newBranch: branchTrimmed,
                creationBase: { kind: 'localBranch', branch: base },
              },
              syncBeforeCreate: false,
            }
          : null
      case 'existingBranch':
        return existingBranch && existingBranchExists
          ? {
              worktreePath: effectivePath,
              mode: { kind: 'existingBranch', branch: existingBranch },
              syncBeforeCreate: syncBeforeCreate && canSynchronizeBranch(repo, existingBranch),
            }
          : null
      case 'trackRemoteBranch':
        return activeRemoteRef && trackLocalBranch && !localBranchError
          ? {
              worktreePath: effectivePath,
              mode: { kind: 'trackRemoteBranch', remoteRef: activeRemoteRef, localBranch: trackLocalBranch },
              syncBeforeCreate: false,
            }
          : null
      case 'detached':
        return detachedRefTrimmed && !detachedRefError
          ? {
              worktreePath: effectivePath,
              mode: { kind: 'detached', ref: detachedRefTrimmed },
              syncBeforeCreate: false,
            }
          : null
    }
    const exhaustive: never = mode
    return exhaustive
  }

  function handleSubmit() {
    const nextInput = buildInput()
    if (!nextInput || branchActionBusy) return
    const submittedSelections = bootstrapEnabled && worktreeBootstrap?.source ? bootstrapSelections : []
    void onCreate({
      input: nextInput,
      selections: submittedSelections,
      ...(submittedSelections.length > 0 && worktreeBootstrap?.source
        ? { sourceWorktreePath: worktreeBootstrap.source.worktreePath }
        : {}),
    })
    onClose()
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={t('action.create-worktree-title')}
      description={t('action.create-worktree-hint')}
    >
      <form
        className="space-y-0"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <Field>
          <FieldLabel>{t('action.create-worktree-mode-label')}</FieldLabel>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(next) => {
              if (next) setMode(next as CreateWorktreeDialogMode)
            }}
            variant="outline"
            size="sm"
            className="w-full"
            aria-label={t('action.create-worktree-mode-label')}
          >
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = mode === option.id
              return (
                <ToggleGroupItem
                  key={option.id}
                  value={option.id}
                  className={cn(
                    'flex min-h-8 flex-1 items-center justify-center gap-1 px-2 text-xs',
                    selected && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Icon size={14} />
                  <span className="truncate">{t(option.labelKey)}</span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </Field>

        {mode === 'newBranch' && (
          <>
            <Field className="mt-2" data-invalid={baseError ? true : undefined}>
              <FieldLabel htmlFor="cwt-base">{t('action.create-worktree-base-label')}</FieldLabel>
              <Select value={base} onValueChange={setBase}>
                <SelectTrigger
                  id="cwt-base"
                  size="sm"
                  className="w-full"
                  aria-invalid={!!baseError}
                  aria-describedby={baseError ? 'cwt-base-error' : undefined}
                >
                  <SelectValue placeholder={t('action.create-worktree-base-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {repo.data.branches.map((b) => (
                    // textValue is the typeahead string (also what Radix
                    // echoes into the trigger via SelectValue). We pass
                    // just the branch name so the trigger shows "main"
                    // instead of "main current" once selected.
                    <SelectItem key={b.name} value={b.name} textValue={b.name}>
                      <span className="truncate">{b.name}</span>
                      {b.name === repo.data.currentBranch && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t('action.create-worktree-base-current')}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="cwt-base-error" reserveHeight aria-live="polite" aria-atomic="true">
                {baseError}
              </FieldError>
            </Field>

            <Field data-invalid={branchError ? true : undefined}>
              <FieldLabel htmlFor="cwt-branch">{t('action.create-worktree-branch-label')}</FieldLabel>
              <Input
                id="cwt-branch"
                autoFocus
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder={t('action.create-worktree-branch-placeholder')}
                aria-invalid={!!branchError}
                aria-describedby={branchError ? 'cwt-branch-error' : undefined}
                className="h-8"
              />
              <FieldError id="cwt-branch-error" reserveHeight aria-live="polite" aria-atomic="true">
                {branchError}
              </FieldError>
            </Field>
          </>
        )}

        {mode === 'existingBranch' && (
          <>
            <Field className="mt-2" data-invalid={existingBranchError ? true : undefined}>
              <FieldLabel htmlFor="cwt-existing-branch">{t('action.create-worktree-existing-label')}</FieldLabel>
              <Select
                value={existingBranch}
                onValueChange={(next) => {
                  setExistingBranch(next)
                  setSyncBeforeCreate(canSynchronizeBranch(repo, next))
                }}
              >
                <SelectTrigger
                  id="cwt-existing-branch"
                  size="sm"
                  className="w-full"
                  aria-invalid={!!existingBranchError}
                  aria-describedby={existingBranchError ? 'cwt-existing-branch-error' : undefined}
                >
                  <SelectValue placeholder={t('action.create-worktree-existing-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {repo.data.branches.map((b) => (
                    <SelectItem key={b.name} value={b.name} textValue={b.name}>
                      <span className="truncate">{b.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="cwt-existing-branch-error" reserveHeight aria-live="polite" aria-atomic="true">
                {existingBranchError}
              </FieldError>
            </Field>
            <Field>
              <label htmlFor="cwt-sync-before-create" className="flex items-center gap-2 text-xs font-medium">
                <input
                  id="cwt-sync-before-create"
                  type="checkbox"
                  checked={syncBeforeCreate && canSynchronizeBranch(repo, existingBranch)}
                  disabled={!canSynchronizeBranch(repo, existingBranch)}
                  onChange={(event) => setSyncBeforeCreate(event.target.checked)}
                />
                {t('action.create-worktree-sync-before-create')}
              </label>
              <FieldDescription reserveHeight>
                {canSynchronizeBranch(repo, existingBranch) ? '' : t('action.create-worktree-sync-no-upstream')}
              </FieldDescription>
            </Field>
          </>
        )}

        {mode === 'trackRemoteBranch' && (
          <>
            <Field className="mt-2">
              <FieldLabel htmlFor="cwt-remote-ref">{t('action.create-worktree-remote-label')}</FieldLabel>
              <Select
                value={remoteRef}
                onValueChange={(next) => {
                  setRemoteRef(next)
                  setLocalBranch('')
                }}
                disabled={remoteBranchesLoading || remoteBranches.length === 0}
              >
                <SelectTrigger
                  id="cwt-remote-ref"
                  size="sm"
                  className="w-full"
                  aria-label={t('action.create-worktree-remote-label')}
                >
                  <SelectValue placeholder={t('action.create-worktree-remote-placeholder')} />
                </SelectTrigger>
                <SelectContent
                  matchTriggerWidth
                  header={
                    <RemoteBranchSearchInput
                      id="cwt-remote-ref-filter"
                      value={remoteBranchQuery}
                      onChange={setRemoteBranchQuery}
                      placeholder={t('action.remote-branch-search-placeholder')}
                      ariaLabel={t('action.remote-branch-search-label')}
                      disabled={remoteBranchesLoading || remoteBranches.length === 0}
                    />
                  }
                >
                  {visibleRemoteBranches.map((ref) => (
                    <SelectItem key={ref} value={ref} textValue={ref}>
                      <span className="truncate">{ref}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription reserveHeight aria-live="polite" aria-atomic="true">
                {remoteBranchesLoading
                  ? t('action.create-worktree-remote-loading')
                  : remoteBranches.length === 0 || visibleRemoteBranches.length === 0
                    ? t('action.create-worktree-remote-empty')
                    : ''}
              </FieldDescription>
            </Field>

            <Field data-invalid={localBranchError ? true : undefined}>
              <FieldLabel htmlFor="cwt-local-branch">{t('action.create-worktree-local-branch-label')}</FieldLabel>
              <Input
                id="cwt-local-branch"
                value={localBranch}
                onChange={(e) => setLocalBranch(e.target.value)}
                placeholder={derivedLocalBranch || t('action.create-worktree-local-branch-placeholder')}
                aria-invalid={!!localBranchError}
                aria-describedby={localBranchError ? 'cwt-local-branch-error' : undefined}
                className="h-8"
              />
              <FieldError id="cwt-local-branch-error" reserveHeight aria-live="polite" aria-atomic="true">
                {localBranchError}
              </FieldError>
            </Field>
          </>
        )}

        {mode === 'detached' && (
          <Field className="mt-2" data-invalid={detachedRefError ? true : undefined}>
            <FieldLabel htmlFor="cwt-detached-ref">{t('action.create-worktree-ref-label')}</FieldLabel>
            <Input
              id="cwt-detached-ref"
              value={detachedRef}
              onChange={(e) => setDetachedRef(e.target.value)}
              placeholder={t('action.create-worktree-ref-placeholder')}
              aria-invalid={!!detachedRefError}
              aria-describedby={detachedRefError ? 'cwt-detached-ref-error' : undefined}
              className="h-8"
            />
            <FieldError id="cwt-detached-ref-error" reserveHeight aria-live="polite" aria-atomic="true">
              {detachedRefError}
            </FieldError>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="cwt-path">{t('action.create-worktree-path-label')}</FieldLabel>
          <Input
            id="cwt-path"
            value={worktreePath}
            disabled={!pathName}
            onChange={(e) => setWorktreePath(e.target.value)}
            placeholder={displayDefaultPath}
            aria-describedby="cwt-path-hint"
            className="h-8 font-mono text-xs"
            list={pathSuggestions.length > 0 ? 'create-worktree-path-suggestions' : undefined}
          />
          {pathSuggestions.length > 0 && (
            <datalist id="create-worktree-path-suggestions">
              {pathSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}
          <FieldDescription
            id="cwt-path-hint"
            reserveHeight
            className="truncate"
            title={displayEffectivePath || undefined}
          >
            {!pathName ? t('action.create-worktree-path-disabled-hint') : effectivePath ? displayEffectivePath : ''}
          </FieldDescription>
        </Field>
        <Field className="mt-2">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch
              checked={bootstrapEnabled}
              disabled={branchActionBusy}
              aria-label={t('action.create-worktree-bootstrap-toggle')}
              title={t('action.create-worktree-bootstrap-toggle')}
              onCheckedChange={(enabled) => {
                if (!enabled) setBootstrapSelections([])
                onBootstrapEnabledChange?.(enabled)
              }}
            />
            <span>{t('action.create-worktree-bootstrap-toggle')}</span>
          </label>
        </Field>
        {bootstrapEnabled && worktreeBootstrap?.source ? (
          <WorktreeBootstrapSourcePicker
            source={worktreeBootstrap.source}
            options={worktreeBootstrap.sourceOptions ?? []}
            pending={branchActionBusy}
            onSourceChange={(source) => {
              setBootstrapSelections([])
              onBootstrapSourceChange?.(source)
            }}
          />
        ) : null}
        {bootstrapEnabled && worktreeBootstrap?.source ? (
          <WorktreeDependencyTree
            repoId={repo.id}
            sourceWorktreePath={worktreeBootstrap.source.worktreePath}
            selections={bootstrapSelections}
            disabled={branchActionBusy}
            onSelectionsChange={setBootstrapSelections}
          />
        ) : null}
        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" className={cn(compact && 'w-full')} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" className={cn(compact && 'w-full')} disabled={!canSubmit}>
            {t('action.create-worktree-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

function defaultNewBranchName(currentBranch: string, now = new Date()): string {
  if (!currentBranch) return ''
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `feat/${year}${month}${day}-${currentBranch}`
}

function worktreePathName(input: {
  mode: CreateWorktreeDialogMode
  branchTrimmed: string
  existingBranch: string
  trackLocalBranch: string
  detachedRefTrimmed: string
}): string {
  switch (input.mode) {
    case 'newBranch':
      return input.branchTrimmed
    case 'existingBranch':
      return input.existingBranch
    case 'trackRemoteBranch':
      return input.trackLocalBranch
    case 'detached':
      return input.detachedRefTrimmed
  }
  const exhaustive: never = input.mode
  return exhaustive
}

function defaultRemoteWorktreePath(repoPath: string, name: string): string {
  const slug = name.trim().replaceAll('/', '-')
  if (!slug) return ''
  const normalized = repoPath.replace(/\/+$/, '')
  const baseName = normalized.split('/').filter(Boolean).at(-1) ?? 'worktree'
  const parent = normalized.slice(0, Math.max(0, normalized.lastIndexOf('/'))) || '/'
  return `${parent === '/' ? '' : parent}/${baseName}-${slug}`
}

function canSynchronizeBranch(repo: RepoState, branch: string): boolean {
  const details = repo.data.branches.find((candidate) => candidate.name === branch)
  return !!details?.tracking && !details.trackingGone && isRemoteTrackingRef(details.tracking)
}
