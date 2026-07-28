import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Circle,
  CircleCheck,
  CircleX,
  GitMerge,
  LoaderCircle,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import type { CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import type {
  BranchWorkspaceBatchCommitPlan,
  BranchWorkspaceCommitMessageInput,
  BranchWorkspaceGitActionKind,
  BranchWorkspaceGitActionPlan,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceMergeMode,
  BranchWorkspaceSyncPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { projectBranchWorkspaceBatchMergeProgress } from '#/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

interface BranchWorkspaceGitActionPanelProps {
  open: boolean
  kind: BranchWorkspaceGitActionKind
  plan: BranchWorkspaceGitActionPlan | null
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onBatchCommit: (messages: BranchWorkspaceCommitMessageInput[]) => Promise<BranchWorkspaceGitActionResult | null>
  onMergeBack: (
    mode: BranchWorkspaceMergeMode,
    repositoryNames: string[],
  ) => Promise<BranchWorkspaceGitActionResult | null>
  onSync: (kind: 'pull' | 'push') => Promise<BranchWorkspaceGitActionResult | null>
  onCancel: () => Promise<unknown>
}

type GenerationState = 'idle' | 'generating' | 'ready' | 'failed'

export function BranchWorkspaceGitActionPanel({
  open,
  kind,
  plan,
  result,
  activeOperation,
  pending,
  error,
  onOpenChange,
  onBatchCommit,
  onMergeBack,
  onSync,
  onCancel,
}: BranchWorkspaceGitActionPanelProps) {
  const t = useT()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [generation, setGeneration] = useState<Record<string, GenerationState>>({})
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({})
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>({ codex: false, claude: false })
  const [generatingProvider, setGeneratingProvider] = useState<CommitMessageProvider | null>(null)
  const [selectedMergeRepositories, setSelectedMergeRepositories] = useState<string[]>([])
  const [startedMergeMode, setStartedMergeMode] = useState<BranchWorkspaceMergeMode | null>(null)
  const generationController = useRef<AbortController | null>(null)

  useEffect(() => {
    generationController.current?.abort()
    setDrafts({})
    setGeneration({})
    setGenerationErrors({})
    setGeneratingProvider(null)
    setSelectedMergeRepositories(
      plan?.kind === 'merge-back'
        ? plan.members.filter((member) => !member.mergeSatisfied).map((member) => member.repositoryName)
        : [],
    )
    setStartedMergeMode(null)
  }, [open, plan?.token])

  useEffect(() => {
    if (!open || plan?.kind !== 'batch-commit') return
    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then(setProviders)
      .catch(() => setProviders({ codex: false, claude: false }))
    return () => controller.abort()
  }, [open, plan?.kind, plan?.token])

  const close = () => {
    generationController.current?.abort()
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const runAndClose = async (action: () => Promise<BranchWorkspaceGitActionResult | null>) => {
    const response = await action()
    if (response?.ok) onOpenChange(false)
  }

  if (!open) return null
  const actionKind = plan?.kind ?? kind
  const titleKey = `workspace.branch-workspace.git-action.${actionKind}`
  const descriptionKey = `workspace.branch-workspace.git-action.${actionKind}-description`

  if (actionKind === 'merge-back') {
    const mergePlan = plan?.kind === 'merge-back' ? plan : null
    const executeMerge = async (mode: BranchWorkspaceMergeMode) => {
      setStartedMergeMode(mode)
      const response = await onMergeBack(mode, selectedMergeRepositories)
      if (response?.ok) onOpenChange(false)
    }
    return (
      <BranchWorkspaceBatchMergeDialog
        plan={mergePlan}
        result={result}
        activeOperation={activeOperation}
        pending={pending}
        error={error}
        selectedRepositories={selectedMergeRepositories}
        startedMode={startedMergeMode}
        onSelectedRepositoriesChange={setSelectedMergeRepositories}
        onExecute={executeMerge}
        onClose={close}
      />
    )
  }

  return (
    <div
      data-testid="branch-workspace-git-action-panel"
      className="mt-1 grid gap-3 border-t border-app-region-border bg-app-region px-4 py-3"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold leading-none tracking-tight">{t(titleKey)}</h3>
        <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
      </div>

      {!plan ? (
        <div className="flex min-h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className={cn('size-4', pending && 'animate-spin')} aria-hidden="true" />
          {t('workspace.branch-workspace.git-action.planning')}
        </div>
      ) : plan.kind === 'batch-commit' ? (
        <BatchCommitContent
          plan={plan}
          result={result}
          providers={providers}
          drafts={drafts}
          generation={generation}
          generationErrors={generationErrors}
          generatingProvider={generatingProvider}
          disabled={pending}
          onDraftChange={(repositoryName, message) =>
            setDrafts((current) => ({ ...current, [repositoryName]: message }))
          }
          onGenerateAll={(provider) =>
            void generateAll(
              plan,
              provider,
              setGeneratingProvider,
              generationController,
              setDrafts,
              setGeneration,
              setGenerationErrors,
            )
          }
          onGenerateOne={(repositoryName, provider) =>
            void generateOne(
              plan,
              repositoryName,
              provider,
              setGeneratingProvider,
              generationController,
              setDrafts,
              setGeneration,
              setGenerationErrors,
            )
          }
        />
      ) : plan.kind === 'pull' || plan.kind === 'push' ? (
        <SyncContent plan={plan} result={result} activeOperation={activeOperation} />
      ) : null}

      {error ? <DialogError>{t(error)}</DialogError> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          {t('dialog.cancel')}
        </Button>
        {plan?.kind === 'batch-commit' ? (
          <Button
            type="button"
            data-action="batch-commit"
            disabled={pending || generatingProvider !== null || !hasAllMessages(plan, drafts)}
            onClick={() =>
              void runAndClose(() =>
                onBatchCommit(
                  plan.members
                    .filter((member) => member.dirty)
                    .map((member) => ({
                      repositoryName: member.repositoryName,
                      message: drafts[member.repositoryName]!.trim(),
                    })),
                ),
              )
            }
          >
            <SendHorizontal className="size-4" aria-hidden="true" />
            {t(
              result && !result.ok
                ? 'workspace.branch-workspace.retry'
                : 'workspace.branch-workspace.git-action.batch-commit',
            )}
          </Button>
        ) : null}
        {plan?.kind === 'pull' || plan?.kind === 'push' ? (
          <Button
            type="button"
            data-action={plan.kind}
            disabled={pending || !plan.ready}
            onClick={() => void runAndClose(() => onSync(plan.kind))}
          >
            {plan.kind === 'pull' ? (
              <ArrowDown className="size-4" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-4" aria-hidden="true" />
            )}
            {t(
              result && !result.ok
                ? 'workspace.branch-workspace.retry'
                : `workspace.branch-workspace.git-action.${plan.kind}`,
            )}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function BatchCommitContent({
  plan,
  result,
  providers,
  drafts,
  generation,
  generationErrors,
  generatingProvider,
  disabled,
  onDraftChange,
  onGenerateAll,
  onGenerateOne,
}: {
  plan: BranchWorkspaceBatchCommitPlan
  result: BranchWorkspaceGitActionResult | null
  providers: CommitMessageProviderAvailability
  drafts: Record<string, string>
  generation: Record<string, GenerationState>
  generationErrors: Record<string, string>
  generatingProvider: CommitMessageProvider | null
  disabled: boolean
  onDraftChange: (repositoryName: string, message: string) => void
  onGenerateAll: (provider: CommitMessageProvider) => void
  onGenerateOne: (repositoryName: string, provider: CommitMessageProvider) => void
}) {
  const t = useT()
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-separator bg-muted/25 px-3 py-2">
        <span className="mr-auto text-[11px] text-muted-foreground">
          {t('workspace.branch-workspace.git-action.generate-description')}
        </span>
        <div data-testid="branch-workspace-generate-all-actions" className="ml-auto flex shrink-0 items-center gap-2">
          {(['codex', 'claude'] as const).map((provider) => (
            <Button
              key={provider}
              type="button"
              size="sm"
              variant="outline"
              data-action={`generate-all-${provider}`}
              disabled={disabled || result !== null || !providers[provider] || generatingProvider !== null}
              onClick={() => onGenerateAll(provider)}
            >
              {generatingProvider === provider ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              {t('workspace.branch-workspace.git-action.generate-all', {
                provider: provider === 'codex' ? 'Codex' : 'Claude',
              })}
            </Button>
          ))}
        </div>
      </div>
      <div className="max-h-[52vh] overflow-y-auto rounded-md border border-separator">
        {plan.members.map((member, index) => {
          const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          const state = generation[member.repositoryName] ?? 'idle'
          const locked = memberResult?.phase === 'succeeded'
          return (
            <div
              key={member.repositoryName}
              className="grid gap-2 border-b border-separator/60 px-3 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-medium">{member.repositoryName}</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">{member.targetBranch}</span>
                <span className="text-[10px] text-muted-foreground">
                  {member.dirty
                    ? t('workspace.branch-workspace.git-action.change-count', { count: member.changeCount })
                    : t('workspace.branch-workspace.git-action.clean-skipped')}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {memberResult ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`) : null}
                </span>
              </div>
              {member.dirty ? (
                <>
                  <textarea
                    data-repository={member.repositoryName}
                    value={drafts[member.repositoryName] ?? ''}
                    rows={3}
                    disabled={disabled || locked}
                    aria-label={t('workspace.branch-workspace.git-action.commit-message', {
                      repository: member.repositoryName,
                    })}
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
                    onChange={(event) => onDraftChange(member.repositoryName, event.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] text-muted-foreground', state === 'failed' && 'text-danger')}>
                      {state === 'generating'
                        ? t('workspace.branch-workspace.git-action.generating')
                        : generationErrors[member.repositoryName]
                          ? t(generationErrors[member.repositoryName])
                          : null}
                    </span>
                    <div className="ml-auto flex gap-1">
                      {(['codex', 'claude'] as const).map((provider) => (
                        <Button
                          key={provider}
                          type="button"
                          size="sm"
                          className="h-5 px-1.5"
                          variant="ghost"
                          disabled={
                            disabled ||
                            locked ||
                            !providers[provider] ||
                            generatingProvider !== null ||
                            state === 'generating'
                          }
                          onClick={() => onGenerateOne(member.repositoryName, provider)}
                        >
                          {provider === 'codex' ? 'Codex' : 'Claude'}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BranchWorkspaceBatchMergeDialog({
  plan,
  result,
  activeOperation,
  pending,
  error,
  selectedRepositories,
  startedMode,
  onSelectedRepositoriesChange,
  onExecute,
  onClose,
}: {
  plan: Extract<BranchWorkspaceGitActionPlan, { kind: 'merge-back' }> | null
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  pending: boolean
  error: string | null
  selectedRepositories: string[]
  startedMode: BranchWorkspaceMergeMode | null
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
  onExecute: (mode: BranchWorkspaceMergeMode) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const locked = pending || startedMode !== null
  const selectedMembers = plan?.members.filter((member) => selectedRepositories.includes(member.repositoryName)) ?? []
  const hasSelection = selectedMembers.length > 0
  const remoteReady = hasSelection && selectedMembers.every((member) => member.pullMergePushReady)
  const progress =
    plan && startedMode
      ? projectBranchWorkspaceBatchMergeProgress(plan, selectedRepositories, startedMode, activeOperation, result)
      : null

  const toggleRepository = (repositoryName: string, checked: boolean) => {
    if (locked || !plan) return
    onSelectedRepositoriesChange(
      checked
        ? plan.members
            .filter(
              (member) =>
                member.repositoryName === repositoryName || selectedRepositories.includes(member.repositoryName),
            )
            .map((member) => member.repositoryName)
        : selectedRepositories.filter((name) => name !== repositoryName),
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="branch-workspace-batch-merge-dialog"
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{t('workspace.branch-workspace.git-action.merge-back')}</DialogTitle>
          <DialogDescription>{t('workspace.branch-workspace.git-action.merge-back-description')}</DialogDescription>
        </DialogHeader>

        {!plan ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className={cn('size-4', pending && 'animate-spin')} aria-hidden="true" />
            {t('workspace.branch-workspace.git-action.planning')}
          </div>
        ) : (
          <div className="grid gap-2">
            {progress ? (
              <div
                data-testid="branch-workspace-batch-merge-progress"
                data-completed={progress.completedCount}
                data-total={progress.totalCount}
                className="flex items-center justify-between rounded-md border border-separator bg-muted/25 px-3 py-2 text-xs"
              >
                <span className="font-medium">{t('workspace.branch-workspace.git-action.progress')}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t('workspace.branch-workspace.progress.summary', {
                    completed: progress.completedCount,
                    total: progress.totalCount,
                  })}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('workspace.branch-workspace.git-action.selected-count', {
                  selected: selectedMembers.length,
                  total: plan.members.filter((member) => !member.mergeSatisfied).length,
                })}
              </p>
            )}

            <div className="overflow-hidden rounded-md border border-separator">
              {plan.members.map((member, index) => {
                const selected = selectedRepositories.includes(member.repositoryName)
                const memberProgress = progress?.members.find(
                  (candidate) => candidate.repositoryName === member.repositoryName,
                )
                return (
                  <div
                    key={member.repositoryName}
                    className="grid gap-2 border-b border-separator/60 px-3 py-3 text-xs last:border-b-0"
                  >
                    <div className="grid grid-cols-[1rem_2rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2">
                      <Checkbox
                        data-merge-repository={member.repositoryName}
                        checked={selected}
                        disabled={locked || member.mergeSatisfied}
                        aria-label={t('workspace.branch-workspace.git-action.select-member', {
                          repository: member.repositoryName,
                        })}
                        onCheckedChange={(checked) => toggleRepository(member.repositoryName, checked === true)}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-medium">{member.repositoryName}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {member.targetBranch} → {member.baseBranch}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] text-muted-foreground',
                          !member.pullMergePushReady && !member.mergeSatisfied && 'text-warning',
                        )}
                      >
                        {member.mergeSatisfied
                          ? t('workspace.branch-workspace.git-action.already-merged')
                          : !selected
                            ? t('workspace.branch-workspace.git-action.not-selected')
                            : !member.pullMergePushReady
                              ? t('workspace.branch-workspace.git-action.no-upstream')
                              : t('workspace.branch-workspace.git-action.ready')}
                      </span>
                    </div>
                    {memberProgress?.selected ? (
                      <div className="ml-12 flex flex-wrap items-center gap-1.5">
                        {memberProgress.steps.map((step, stepIndex) => (
                          <div key={step.step} className="flex items-center gap-1.5">
                            {stepIndex > 0 ? <span className="text-muted-foreground/50">→</span> : null}
                            <span
                              data-merge-step={`${member.repositoryName}:${step.step}`}
                              data-status={step.status}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border border-separator px-2 py-0.5 text-[10px] text-muted-foreground',
                                step.status === 'active' && 'border-primary/40 bg-primary/10 text-foreground',
                                step.status === 'complete' && 'border-success-border bg-success-surface text-success',
                                step.status === 'failed' && 'border-danger-border bg-danger-surface text-danger',
                              )}
                            >
                              <MergeStepIcon status={step.status} />
                              {t(`workspace.branch-workspace.git-action.step.${step.step}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error ? <DialogError>{t(error)}</DialogError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          {plan && startedMode ? (
            <Button
              type="button"
              data-action={startedMode}
              disabled={pending}
              onClick={() => void onExecute(startedMode)}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t(result && !result.ok ? 'workspace.branch-workspace.retry' : mergeModeLabel(startedMode))}
            </Button>
          ) : plan ? (
            <>
              <Button
                type="button"
                variant="outline"
                data-action="merge"
                disabled={pending || !hasSelection}
                onClick={() => void onExecute('merge')}
              >
                <GitMerge className="size-4" aria-hidden="true" />
                {t('workspace.branch-workspace.git-action.merge')}
              </Button>
              <Button
                type="button"
                data-action="pull-merge-push"
                disabled={pending || !remoteReady}
                onClick={() => void onExecute('pull-merge-push')}
              >
                {t('workspace.branch-workspace.git-action.pull-merge-push')}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeStepIcon({ status }: { status: 'pending' | 'active' | 'complete' | 'failed' }) {
  if (status === 'active') return <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
  if (status === 'complete') return <CircleCheck className="size-3" aria-hidden="true" />
  if (status === 'failed') return <CircleX className="size-3" aria-hidden="true" />
  return <Circle className="size-3" aria-hidden="true" />
}

function mergeModeLabel(mode: BranchWorkspaceMergeMode) {
  return `workspace.branch-workspace.git-action.${mode}` as const
}

function SyncContent({
  plan,
  result,
  activeOperation,
}: {
  plan: BranchWorkspaceSyncPlan
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
}) {
  const t = useT()
  return (
    <div className="overflow-hidden rounded-md border border-separator">
      {plan.members.map((member, index) => {
        const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
        const active = activeOperation?.repositoryName === member.repositoryName
        return (
          <div
            key={member.repositoryName}
            className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem] items-center gap-2 border-b border-separator/60 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            <span className="truncate font-medium">{member.repositoryName}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{member.targetBranch}</span>
            <span className={cn('text-[10px] text-muted-foreground', !member.ready && 'text-warning')}>
              {active && activeOperation.step
                ? t(`workspace.branch-workspace.git-action.step.${activeOperation.step}`)
                : memberResult
                  ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                  : member.message
                    ? t(member.message)
                    : t('workspace.branch-workspace.git-action.ready')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

async function generateAll(
  plan: BranchWorkspaceBatchCommitPlan,
  provider: CommitMessageProvider,
  setGeneratingProvider: (provider: CommitMessageProvider | null) => void,
  controllerRef: React.MutableRefObject<AbortController | null>,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setGeneration: React.Dispatch<React.SetStateAction<Record<string, GenerationState>>>,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  controllerRef.current?.abort()
  const controller = new AbortController()
  controllerRef.current = controller
  setGeneratingProvider(provider)
  for (const member of plan.members) {
    if (!member.dirty || controller.signal.aborted) continue
    await generateMember(member, provider, controller.signal, setDrafts, setGeneration, setErrors)
  }
  if (controllerRef.current === controller) {
    controllerRef.current = null
    setGeneratingProvider(null)
  }
}

async function generateOne(
  plan: BranchWorkspaceBatchCommitPlan,
  repositoryName: string,
  provider: CommitMessageProvider,
  setGeneratingProvider: (provider: CommitMessageProvider | null) => void,
  controllerRef: React.MutableRefObject<AbortController | null>,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setGeneration: React.Dispatch<React.SetStateAction<Record<string, GenerationState>>>,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  const member = plan.members.find((candidate) => candidate.repositoryName === repositoryName && candidate.dirty)
  if (!member) return
  controllerRef.current?.abort()
  const controller = new AbortController()
  controllerRef.current = controller
  setGeneratingProvider(provider)
  await generateMember(member, provider, controller.signal, setDrafts, setGeneration, setErrors)
  if (controllerRef.current === controller) {
    controllerRef.current = null
    setGeneratingProvider(null)
  }
}

async function generateMember(
  member: BranchWorkspaceBatchCommitPlan['members'][number],
  provider: CommitMessageProvider,
  signal: AbortSignal,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setGeneration: React.Dispatch<React.SetStateAction<Record<string, GenerationState>>>,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  setGeneration((current) => ({ ...current, [member.repositoryName]: 'generating' }))
  setErrors((current) => ({ ...current, [member.repositoryName]: '' }))
  try {
    const response = await generateRepositoryCommitMessage(member.repoId, member.targetWorktreePath, provider, signal)
    if (signal.aborted) return
    if (!response.ok) {
      setGeneration((current) => ({ ...current, [member.repositoryName]: 'failed' }))
      setErrors((current) => ({ ...current, [member.repositoryName]: response.message }))
      return
    }
    setDrafts((current) =>
      current[member.repositoryName]?.trim()
        ? current
        : { ...current, [member.repositoryName]: response.message.trim() },
    )
    setGeneration((current) => ({ ...current, [member.repositoryName]: 'ready' }))
  } catch {
    if (signal.aborted) return
    setGeneration((current) => ({ ...current, [member.repositoryName]: 'failed' }))
    setErrors((current) => ({
      ...current,
      [member.repositoryName]: 'workspace.branch-workspace.git-action.generation-failed',
    }))
  }
}

function hasAllMessages(plan: BranchWorkspaceBatchCommitPlan, drafts: Record<string, string>): boolean {
  const dirtyMembers = plan.members.filter((member) => member.dirty)
  return dirtyMembers.length > 0 && dirtyMembers.every((member) => Boolean(drafts[member.repositoryName]?.trim()))
}
