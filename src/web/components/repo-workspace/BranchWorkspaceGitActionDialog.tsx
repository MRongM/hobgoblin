import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GitMerge, LoaderCircle, RotateCcw, SendHorizontal, Sparkles } from 'lucide-react'
import type { CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import type {
  BranchWorkspaceBatchMergeInSourceInput,
  BranchWorkspaceBatchMergeOutTargetInput,
  BranchWorkspaceBatchSetUpstreamInput,
  BranchWorkspaceBatchCommitPlan,
  BranchWorkspaceBatchDiscardPlan,
  BranchWorkspaceBatchSetUpstreamPlan,
  BranchWorkspaceCommitMessageInput,
  BranchWorkspaceGitActionKind,
  BranchWorkspaceGitActionPlan,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceMergeMode,
  BranchWorkspaceSyncPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import {
  repositoryMergeBranchDisplayName,
  repositoryMergeBranchSelectionKey,
} from '#/shared/repository-merge-branch.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { MergeConflictAiActions } from '#/web/components/MergeConflictAiActions.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import {
  projectBranchWorkspaceBatchMergeInProgress,
  projectBranchWorkspaceBatchMergeOutProgress,
} from '#/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts'
import {
  branchWorkspaceActiveMemberStep,
  projectBranchWorkspaceBatchProgress,
} from '#/web/components/repo-workspace/branch-workspace-batch-progress.ts'
import { BranchWorkspaceBatchProgress } from '#/web/components/repo-workspace/BranchWorkspaceBatchProgress.tsx'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'
import type { BranchWorkspaceBatchErrorAiFailure } from '#/web/ai-terminal-handoff.ts'
import { cn } from '#/web/lib/cn.ts'
import { remoteBranchRefMatchesQuery } from '#/shared/remote-branches.ts'
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
  onBatchCommitAndPush: (
    messages: BranchWorkspaceCommitMessageInput[],
  ) => Promise<BranchWorkspaceGitActionResult | null>
  onBatchDiscard: () => Promise<BranchWorkspaceGitActionResult | null>
  onBatchSetUpstream: (
    upstreams: BranchWorkspaceBatchSetUpstreamInput[],
  ) => Promise<BranchWorkspaceGitActionResult | null>
  onBatchMergeIn: (
    mode: BranchWorkspaceMergeMode,
    sources: BranchWorkspaceBatchMergeInSourceInput[],
  ) => Promise<BranchWorkspaceGitActionResult | null>
  onBatchMergeOut: (
    mode: BranchWorkspaceMergeMode,
    targets: BranchWorkspaceBatchMergeOutTargetInput[],
  ) => Promise<BranchWorkspaceGitActionResult | null>
  onSync: (kind: 'pull' | 'push', repositoryNames: string[]) => Promise<BranchWorkspaceGitActionResult | null>
  onCancel: () => Promise<unknown>
  onBatchErrorAiHandoff: (input: BranchWorkspaceBatchErrorAiHandoffInput) => Promise<boolean>
}

export interface BranchWorkspaceBatchErrorAiHandoffInput {
  provider: CommitMessageProvider
  kind: BranchWorkspaceGitActionKind
  failures: BranchWorkspaceBatchErrorAiFailure[]
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
  onBatchCommitAndPush,
  onBatchDiscard,
  onBatchSetUpstream,
  onBatchMergeIn,
  onBatchMergeOut,
  onSync,
  onCancel,
  onBatchErrorAiHandoff,
}: BranchWorkspaceGitActionPanelProps) {
  const t = useT()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [generation, setGeneration] = useState<Record<string, GenerationState>>({})
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({})
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>({ codex: false, claude: false })
  const [generatingProvider, setGeneratingProvider] = useState<CommitMessageProvider | null>(null)
  const [autoCommitAndPush, setAutoCommitAndPush] = useState(false)
  const [selectedCommitRepositories, setSelectedCommitRepositories] = useState<string[]>([])
  const [selectedMergeRepositories, setSelectedMergeRepositories] = useState<string[]>([])
  const [selectedSyncRepositories, setSelectedSyncRepositories] = useState<string[]>([])
  const [selectedUpstreamRepositories, setSelectedUpstreamRepositories] = useState<string[]>([])
  const [mergeSources, setMergeSources] = useState<Record<string, string>>({})
  const [mergeDestinations, setMergeDestinations] = useState<Record<string, string>>({})
  const [upstreams, setUpstreams] = useState<Record<string, string>>({})
  const [upstreamQueries, setUpstreamQueries] = useState<Record<string, string>>({})
  const [upstreamActions, setUpstreamActions] = useState<Record<string, 'set' | 'unset'>>({})
  const [startedMergeMode, setStartedMergeMode] = useState<BranchWorkspaceMergeMode | null>(null)
  const [startedUpstreamUpdate, setStartedUpstreamUpdate] = useState(false)
  const generationController = useRef<AbortController | null>(null)

  useEffect(() => {
    generationController.current?.abort()
    setDrafts({})
    setGeneration({})
    setGenerationErrors({})
    setGeneratingProvider(null)
    setAutoCommitAndPush(false)
    setSelectedCommitRepositories(
      plan?.kind === 'batch-commit'
        ? plan.members.filter((member) => member.dirty).map((member) => member.repositoryName)
        : [],
    )
    setSelectedMergeRepositories(
      plan?.kind === 'batch-merge-in'
        ? plan.members
            .filter((member) => member.ready && member.sourceBranches.length > 0)
            .map((member) => member.repositoryName)
        : plan?.kind === 'batch-merge-out'
          ? plan.members
              .filter((member) => member.ready && member.destinationBranches.some((destination) => destination.ready))
              .map((member) => member.repositoryName)
          : [],
    )
    setSelectedSyncRepositories(
      plan?.kind === 'pull' || plan?.kind === 'push'
        ? plan.members.filter((member) => member.ready).map((member) => member.repositoryName)
        : [],
    )
    setSelectedUpstreamRepositories(
      plan?.kind === 'batch-set-upstream'
        ? plan.members
            .filter((member) => member.ready && member.remoteBranches.length > 0)
            .map((member) => member.repositoryName)
        : [],
    )
    setMergeSources({})
    setMergeDestinations({})
    setUpstreams({})
    setUpstreamQueries({})
    setUpstreamActions({})
    setStartedMergeMode(null)
    setStartedUpstreamUpdate(false)
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
  const generateAllMessages = async (batchPlan: BranchWorkspaceBatchCommitPlan, provider: CommitMessageProvider) => {
    const messages = await generateAll(
      batchPlan,
      provider,
      setGeneratingProvider,
      generationController,
      setDrafts,
      setGeneration,
      setGenerationErrors,
      autoCommitAndPush,
    )
    if (!autoCommitAndPush || !messages) return
    await runAndClose(() => onBatchCommitAndPush(messages))
  }

  if (!open) return null
  const actionKind = plan?.kind ?? kind
  const titleKey = `workspace.branch-workspace.git-action.${actionKind}`
  const descriptionKey = `workspace.branch-workspace.git-action.${actionKind}-description`

  if (actionKind === 'batch-merge-in') {
    const mergeInPlan = plan?.kind === 'batch-merge-in' ? plan : null
    const executeMerge = async (mode: BranchWorkspaceMergeMode) => {
      setStartedMergeMode(mode)
      const sources =
        mergeInPlan?.members
          .filter((member) => selectedMergeRepositories.includes(member.repositoryName))
          .flatMap((member) => {
            const selectedKey = mergeSources[member.repositoryName]
            const source = member.sourceBranches.find(
              (candidate) => repositoryMergeBranchSelectionKey(candidate.source) === selectedKey,
            )
            return source ? [{ repositoryName: member.repositoryName, source: source.source }] : []
          }) ?? []
      const response = await onBatchMergeIn(mode, sources)
      if (response?.ok) onOpenChange(false)
    }
    return (
      <BranchWorkspaceBatchMergeInDialog
        plan={mergeInPlan}
        result={result}
        activeOperation={activeOperation}
        pending={pending}
        error={error}
        selectedRepositories={selectedMergeRepositories}
        sources={mergeSources}
        startedMode={startedMergeMode}
        onSelectedRepositoriesChange={setSelectedMergeRepositories}
        onSourceChange={(repositoryName, sourceKey) =>
          setMergeSources((current) => ({ ...current, [repositoryName]: sourceKey }))
        }
        onExecute={executeMerge}
        onClose={close}
        onBatchErrorAiHandoff={onBatchErrorAiHandoff}
      />
    )
  }

  if (actionKind === 'batch-merge-out') {
    const mergeOutPlan = plan?.kind === 'batch-merge-out' ? plan : null
    const executeMerge = async (mode: BranchWorkspaceMergeMode) => {
      setStartedMergeMode(mode)
      const targets =
        mergeOutPlan?.members
          .filter((member) => selectedMergeRepositories.includes(member.repositoryName))
          .flatMap((member) => {
            const selectedKey = mergeDestinations[member.repositoryName]
            const destination = member.destinationBranches.find(
              (candidate) => repositoryMergeBranchSelectionKey(candidate.destination) === selectedKey,
            )
            return destination ? [{ repositoryName: member.repositoryName, destination: destination.destination }] : []
          }) ?? []
      const response = await onBatchMergeOut(mode, targets)
      if (response?.ok) onOpenChange(false)
    }
    return (
      <BranchWorkspaceBatchMergeOutDialog
        plan={mergeOutPlan}
        result={result}
        activeOperation={activeOperation}
        pending={pending}
        error={error}
        selectedRepositories={selectedMergeRepositories}
        destinations={mergeDestinations}
        startedMode={startedMergeMode}
        onSelectedRepositoriesChange={setSelectedMergeRepositories}
        onDestinationChange={(repositoryName, destinationKey) =>
          setMergeDestinations((current) => ({ ...current, [repositoryName]: destinationKey }))
        }
        onExecute={executeMerge}
        onClose={close}
        onBatchErrorAiHandoff={onBatchErrorAiHandoff}
      />
    )
  }

  const upstreamPlan = plan?.kind === 'batch-set-upstream' ? plan : null
  const selectedUpstreamMembers =
    upstreamPlan?.members.filter((member) => selectedUpstreamRepositories.includes(member.repositoryName)) ?? []
  const selectedUpstreams = selectedUpstreamMembers.flatMap<BranchWorkspaceBatchSetUpstreamInput>((member) => {
    if (upstreamActions[member.repositoryName] === 'unset') {
      return [{ repositoryName: member.repositoryName, action: 'unset' }]
    }
    const remoteRef = upstreams[member.repositoryName]
    return member.remoteBranches.some((candidate) => candidate.remoteRef === remoteRef)
      ? [{ repositoryName: member.repositoryName, action: 'set', remoteRef }]
      : []
  })
  const upstreamSelectionReady =
    selectedUpstreamMembers.length > 0 && selectedUpstreams.length === selectedUpstreamMembers.length

  const nonMergeProgress = plan
    ? plan.kind === 'batch-commit'
      ? projectBranchWorkspaceBatchProgress({
          members: plan.members,
          selectedRepositoryNames: selectedCommitRepositories,
          stepsFor: () => ['commit'],
          activeOperation,
          result,
        })
      : plan.kind === 'batch-discard'
        ? projectBranchWorkspaceBatchProgress({
            members: plan.members,
            selectedRepositoryNames: plan.members.filter((m) => m.paths.length > 0).map((m) => m.repositoryName),
            stepsFor: () => ['discard'],
            activeOperation,
            result,
          })
        : plan.kind === 'batch-set-upstream'
          ? projectBranchWorkspaceBatchProgress({
              members: plan.members,
              selectedRepositoryNames: selectedUpstreamRepositories,
              stepsFor: () => ['upstream'],
              activeOperation,
              result,
            })
          : plan.kind === 'pull' || plan.kind === 'push'
            ? projectBranchWorkspaceBatchProgress({
                members: plan.members,
                selectedRepositoryNames: selectedSyncRepositories,
                stepsFor: () => [plan.kind === 'pull' ? 'pull' : 'push'],
                activeOperation,
                result,
              })
            : null
    : null

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : onOpenChange(next))}>
      <DialogContent
        data-testid="branch-workspace-git-action-panel"
        className="max-h-[85vh] w-[calc(100vw-1rem)] max-w-[42.667rem] overflow-y-auto sm:w-[66.667vw] sm:max-w-[42.667rem]"
      >
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>

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
            autoCommitAndPush={autoCommitAndPush}
            disabled={pending}
            selectedRepositories={selectedCommitRepositories}
            onSelectedRepositoriesChange={setSelectedCommitRepositories}
            onAutoCommitAndPushChange={setAutoCommitAndPush}
            onDraftChange={(repositoryName, message) =>
              setDrafts((current) => ({ ...current, [repositoryName]: message }))
            }
            onGenerateAll={(provider) => void generateAllMessages(plan, provider)}
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
        ) : plan.kind === 'batch-discard' ? (
          <BatchDiscardContent plan={plan} result={result} activeOperation={activeOperation} />
        ) : plan.kind === 'batch-set-upstream' ? (
          <BatchSetUpstreamContent
            plan={plan}
            result={result}
            activeOperation={activeOperation}
            pending={pending}
            selectedRepositories={selectedUpstreamRepositories}
            upstreams={upstreams}
            actions={upstreamActions}
            queries={upstreamQueries}
            started={startedUpstreamUpdate}
            onSelectedRepositoriesChange={setSelectedUpstreamRepositories}
            onUpstreamChange={(repositoryName, remoteRef) =>
              setUpstreams((current) => ({ ...current, [repositoryName]: remoteRef }))
            }
            onActionChange={(repositoryName, action) =>
              setUpstreamActions((current) => ({ ...current, [repositoryName]: action }))
            }
            onQueryChange={(repositoryName, query) =>
              setUpstreamQueries((current) => ({ ...current, [repositoryName]: query }))
            }
          />
        ) : plan.kind === 'pull' || plan.kind === 'push' ? (
          <SyncContent
            plan={plan}
            result={result}
            activeOperation={activeOperation}
            selectedRepositories={selectedSyncRepositories}
            disabled={pending}
            onSelectedRepositoriesChange={setSelectedSyncRepositories}
          />
        ) : null}

        {nonMergeProgress ? <BranchWorkspaceBatchProgress progress={nonMergeProgress} /> : null}

        {error ? <DialogError>{t(error)}</DialogError> : null}
        <BranchWorkspaceBatchErrorAiActions
          plan={plan}
          result={result}
          onHandoff={onBatchErrorAiHandoff}
          onHandoffComplete={close}
        />
        {!(plan?.kind === 'batch-commit' && autoCommitAndPush) ? (
          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('dialog.cancel')}
            </Button>
            {plan?.kind === 'batch-commit' ? (
              <Button
                type="button"
                data-action="batch-commit"
                disabled={
                  pending ||
                  generatingProvider !== null ||
                  selectedCommitRepositories.length === 0 ||
                  !hasAllMessages(plan, drafts, selectedCommitRepositories)
                }
                onClick={() =>
                  void runAndClose(() =>
                    onBatchCommit(
                      selectedCommitRepositories.map((repositoryName) => ({
                        repositoryName,
                        message: drafts[repositoryName]!.trim(),
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
            {plan?.kind === 'batch-discard' ? (
              <Button
                type="button"
                variant="destructive"
                data-action="batch-discard"
                disabled={pending || !plan.members.some((member) => member.paths.length > 0)}
                onClick={() => void runAndClose(onBatchDiscard)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {t(
                  result && !result.ok
                    ? 'workspace.branch-workspace.retry'
                    : 'workspace.branch-workspace.git-action.batch-discard',
                )}
              </Button>
            ) : null}
            {plan?.kind === 'batch-set-upstream' ? (
              <Button
                type="button"
                data-action="batch-set-upstream"
                disabled={pending || !upstreamSelectionReady}
                onClick={() => {
                  setStartedUpstreamUpdate(true)
                  void runAndClose(() => onBatchSetUpstream(selectedUpstreams))
                }}
              >
                {t(
                  result && !result.ok
                    ? 'workspace.branch-workspace.retry'
                    : 'workspace.branch-workspace.git-action.batch-set-upstream',
                )}
              </Button>
            ) : null}
            {plan?.kind === 'pull' || plan?.kind === 'push' ? (
              <Button
                type="button"
                data-action={plan.kind}
                disabled={pending || selectedSyncRepositories.length === 0}
                onClick={() => void runAndClose(() => onSync(plan.kind, selectedSyncRepositories))}
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
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
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
  autoCommitAndPush,
  disabled,
  selectedRepositories,
  onSelectedRepositoriesChange,
  onAutoCommitAndPushChange,
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
  autoCommitAndPush: boolean
  disabled: boolean
  selectedRepositories: string[]
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
  onAutoCommitAndPushChange: (checked: boolean) => void
  onDraftChange: (repositoryName: string, message: string) => void
  onGenerateAll: (provider: CommitMessageProvider) => void
  onGenerateOne: (repositoryName: string, provider: CommitMessageProvider) => void
}) {
  const t = useT()
  const selectableRepositories = plan.members.filter((member) => member.dirty).map((member) => member.repositoryName)
  const selected = new Set(selectedRepositories)

  const toggleRepository = (repositoryName: string, checked: boolean) => {
    if (disabled) return
    onSelectedRepositoriesChange(
      checked
        ? [...new Set([...selectedRepositories, repositoryName])]
        : selectedRepositories.filter((name) => name !== repositoryName),
    )
  }

  return (
    <div className="grid gap-3">
      <BatchMergeSelectionSummary
        selectableRepositories={selectableRepositories}
        selectedRepositories={selectedRepositories}
        disabled={disabled}
        onSelectedRepositoriesChange={onSelectedRepositoriesChange}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-separator bg-muted/25 px-3 py-2">
        <span className="mr-auto text-[11px] text-muted-foreground">
          {t('workspace.branch-workspace.git-action.generate-description')}
        </span>
        <div data-testid="branch-workspace-generate-all-actions" className="ml-auto flex shrink-0 items-center gap-2">
          {providers.codex || providers.claude ? (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={autoCommitAndPush}
                disabled={disabled || generatingProvider !== null}
                aria-label={t('action.commit-auto-commit-and-push')}
                title={t('action.commit-auto-commit-and-push')}
                onCheckedChange={onAutoCommitAndPushChange}
              />
              <span>{t('action.commit-auto-commit-and-push')}</span>
            </label>
          ) : null}
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
          const isSelected = selected.has(member.repositoryName)
          return (
            <div
              key={member.repositoryName}
              className="grid gap-2 border-b border-separator/60 px-3 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Checkbox
                  data-commit-repository={member.repositoryName}
                  checked={isSelected}
                  disabled={disabled || !member.dirty}
                  aria-label={t('workspace.branch-workspace.git-action.select-member', {
                    repository: member.repositoryName,
                  })}
                  onCheckedChange={(checked) => toggleRepository(member.repositoryName, checked === true)}
                />
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
                  {memberResult
                    ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                    : !isSelected && member.dirty
                      ? t('workspace.branch-workspace.git-action.not-selected')
                      : null}
                </span>
              </div>
              {member.dirty && isSelected ? (
                <>
                  {!autoCommitAndPush ? (
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
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] text-muted-foreground', state === 'failed' && 'text-danger')}>
                      {state === 'generating'
                        ? t('workspace.branch-workspace.git-action.generating')
                        : generationErrors[member.repositoryName]
                          ? t(generationErrors[member.repositoryName])
                          : null}
                    </span>
                    {!autoCommitAndPush ? (
                      <div className="ml-auto flex gap-1">
                        {state === 'failed' && generationErrors[member.repositoryName] ? (
                          <Button
                            key="retry"
                            type="button"
                            size="sm"
                            className="h-5 px-1.5"
                            variant="ghost"
                            data-action="retry-generate"
                            disabled={disabled || locked || generatingProvider !== null}
                            onClick={() => onGenerateOne(member.repositoryName, generatingProvider ?? 'codex')}
                          >
                            <RotateCcw className="size-3" aria-hidden="true" />
                            {t('workspace.branch-workspace.retry')}
                          </Button>
                        ) : null}
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
                    ) : null}
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

function BatchMergeSelectionSummary({
  selectableRepositories,
  selectedRepositories,
  disabled,
  onSelectedRepositoriesChange,
}: {
  selectableRepositories: string[]
  selectedRepositories: string[]
  disabled: boolean
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
}) {
  const t = useT()
  const selected = new Set(selectedRepositories)
  const selectedCount = selectableRepositories.filter((repositoryName) => selected.has(repositoryName)).length
  const allSelected = selectableRepositories.length > 0 && selectedCount === selectableRepositories.length
  const checked = selectedCount === 0 ? false : allSelected ? true : 'indeterminate'

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Checkbox
        data-merge-select-all
        checked={checked}
        disabled={disabled || selectableRepositories.length === 0}
        aria-label={t('workspace.branch-workspace.git-action.select-all-members')}
        onCheckedChange={() => onSelectedRepositoriesChange(allSelected ? [] : selectableRepositories)}
      />
      <span>{t('workspace.branch-workspace.git-action.select-all-members')}</span>
      <span className="ml-auto">
        {t('workspace.branch-workspace.git-action.selected-count', {
          selected: selectedCount,
          total: selectableRepositories.length,
        })}
      </span>
    </div>
  )
}

function BranchWorkspaceBatchMergeInDialog({
  plan,
  result,
  activeOperation,
  pending,
  error,
  selectedRepositories,
  sources,
  startedMode,
  onSelectedRepositoriesChange,
  onSourceChange,
  onExecute,
  onClose,
  onBatchErrorAiHandoff,
}: {
  plan: Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-in' }> | null
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  pending: boolean
  error: string | null
  selectedRepositories: string[]
  sources: Record<string, string>
  startedMode: BranchWorkspaceMergeMode | null
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
  onSourceChange: (repositoryName: string, sourceKey: string) => void
  onExecute: (mode: BranchWorkspaceMergeMode) => Promise<void>
  onClose: () => void
  onBatchErrorAiHandoff: (input: BranchWorkspaceBatchErrorAiHandoffInput) => Promise<boolean>
}) {
  const t = useT()
  const locked = pending || startedMode !== null
  const selectableRepositories =
    plan?.members
      .filter((member) => member.ready && member.sourceBranches.length > 0)
      .map((member) => member.repositoryName) ?? []
  const selectedMembers = plan?.members.filter((member) => selectedRepositories.includes(member.repositoryName)) ?? []
  const hasSelection = selectedMembers.length > 0
  const selectedSources: BranchWorkspaceBatchMergeInSourceInput[] = selectedMembers.flatMap((member) => {
    const selectedKey = sources[member.repositoryName]
    const source = member.sourceBranches.find(
      (candidate) => repositoryMergeBranchSelectionKey(candidate.source) === selectedKey,
    )
    return source ? [{ repositoryName: member.repositoryName, source: source.source }] : []
  })
  const selectionReady = hasSelection && selectedSources.length === selectedMembers.length
  const remoteReady = selectionReady && selectedMembers.every((member) => member.pullMergePushReady)
  const progress =
    plan && startedMode
      ? projectBranchWorkspaceBatchMergeInProgress(plan, selectedSources, startedMode, activeOperation, result)
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
        className="max-h-[85vh] w-[calc(100vw-1rem)] max-w-[42.667rem] overflow-y-auto sm:w-[66.667vw] sm:max-w-[42.667rem]"
      >
        <DialogHeader>
          <DialogTitle>{t('workspace.branch-workspace.git-action.batch-merge-in')}</DialogTitle>
          <DialogDescription>{t('workspace.branch-workspace.git-action.batch-merge-in-description')}</DialogDescription>
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
              >
                <BranchWorkspaceBatchProgress progress={progress} />
              </div>
            ) : null}

            <BatchMergeSelectionSummary
              selectableRepositories={selectableRepositories}
              selectedRepositories={selectedRepositories}
              disabled={locked}
              onSelectedRepositoriesChange={onSelectedRepositoriesChange}
            />

            <div className="overflow-hidden rounded-md border border-separator">
              {plan.members.map((member, index) => {
                const selected = selectedRepositories.includes(member.repositoryName)
                const source = member.sourceBranches.find(
                  (candidate) => repositoryMergeBranchSelectionKey(candidate.source) === sources[member.repositoryName],
                )
                const sourceUnavailable = member.sourceBranches.length === 0
                const memberResult = result?.members.find(
                  (candidate) => candidate.repositoryName === member.repositoryName,
                )
                const activeStep = branchWorkspaceActiveMemberStep(activeOperation, member.repositoryName)
                return (
                  <div
                    key={member.repositoryName}
                    className="grid gap-2 border-b border-separator/60 px-3 py-3 text-xs last:border-b-0"
                  >
                    <div className="grid grid-cols-[1rem_2rem_minmax(0,0.8fr)_minmax(12rem,2fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Checkbox
                        data-merge-repository={member.repositoryName}
                        checked={selected}
                        disabled={locked || !member.ready || sourceUnavailable}
                        aria-label={t('workspace.branch-workspace.git-action.select-member', {
                          repository: member.repositoryName,
                        })}
                        onCheckedChange={(checked) => toggleRepository(member.repositoryName, checked === true)}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-medium">{member.repositoryName}</span>
                      <Select
                        value={sources[member.repositoryName] ?? ''}
                        disabled={locked || !selected || !member.ready || sourceUnavailable}
                        onValueChange={(value) => onSourceChange(member.repositoryName, value)}
                      >
                        <SelectTrigger
                          size="sm"
                          data-merge-source={member.repositoryName}
                          aria-label={t('workspace.branch-workspace.git-action.source-branch', {
                            repository: member.repositoryName,
                          })}
                          title={source ? repositoryMergeBranchDisplayName(source.source) : undefined}
                          className="min-w-48 w-full max-w-none font-mono text-[10px] *:data-[slot=select-value]:line-clamp-none"
                        >
                          <SelectValue placeholder={t('workspace.branch-workspace.git-action.select-source')} />
                        </SelectTrigger>
                        <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-max max-w-[min(94vw,37.333rem)]">
                          {member.sourceBranches.map((candidate) => {
                            const key = repositoryMergeBranchSelectionKey(candidate.source)
                            const name = repositoryMergeBranchDisplayName(candidate.source)
                            const text =
                              candidate.source.kind === 'remote' ? `${name} (${t('tab.remote-branches')})` : name
                            return (
                              <SelectItem
                                key={key}
                                value={key}
                                textValue={text}
                                data-merge-source-option={`${member.repositoryName}:${key}`}
                                data-merge-source-kind={candidate.source.kind}
                                className="font-mono text-xs whitespace-normal break-all"
                              >
                                {text}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground/60">→</span>
                      <span
                        data-merge-target={member.repositoryName}
                        className="truncate font-mono text-[10px] text-muted-foreground"
                      >
                        {member.targetBranch}
                      </span>
                      <span
                        className={cn(
                          'col-start-4 col-span-3 text-right text-[10px] text-muted-foreground',
                          selected && source && !member.pullMergePushReady && 'text-warning',
                        )}
                      >
                        {!member.ready
                          ? t(member.message ?? 'workspace.branch-workspace.git-action.target-worktree-unavailable')
                          : !selected
                            ? t('workspace.branch-workspace.git-action.not-selected')
                            : !source
                              ? t('workspace.branch-workspace.git-action.source-branch-required')
                              : activeStep
                                ? t(`workspace.branch-workspace.git-action.step.${activeStep}`)
                                : memberResult
                                  ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                                  : !member.pullMergePushReady
                                    ? t('workspace.branch-workspace.git-action.no-upstream')
                                    : t('workspace.branch-workspace.git-action.ready')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error ? <DialogError>{t(error)}</DialogError> : null}
        <BranchWorkspaceBatchErrorAiActions
          plan={plan}
          result={result}
          onHandoff={onBatchErrorAiHandoff}
          onHandoffComplete={onClose}
        />
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
              {t(result && !result.ok ? 'workspace.branch-workspace.retry' : mergeModeLabel(startedMode, 'in'))}
            </Button>
          ) : plan ? (
            <>
              <Button
                type="button"
                variant="outline"
                data-action="merge"
                disabled={pending || !selectionReady}
                onClick={() => void onExecute('merge')}
              >
                <GitMerge className="size-4" aria-hidden="true" />
                {t('workspace.branch-workspace.git-action.merge-in')}
              </Button>
              <Button
                type="button"
                data-action="pull-merge-push"
                disabled={pending || !remoteReady}
                onClick={() => void onExecute('pull-merge-push')}
              >
                {t('workspace.branch-workspace.git-action.pull-merge-in-push')}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BranchWorkspaceBatchMergeOutDialog({
  plan,
  result,
  activeOperation,
  pending,
  error,
  selectedRepositories,
  destinations,
  startedMode,
  onSelectedRepositoriesChange,
  onDestinationChange,
  onExecute,
  onClose,
  onBatchErrorAiHandoff,
}: {
  plan: Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-out' }> | null
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  pending: boolean
  error: string | null
  selectedRepositories: string[]
  destinations: Record<string, string>
  startedMode: BranchWorkspaceMergeMode | null
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
  onDestinationChange: (repositoryName: string, destinationKey: string) => void
  onExecute: (mode: BranchWorkspaceMergeMode) => Promise<void>
  onClose: () => void
  onBatchErrorAiHandoff: (input: BranchWorkspaceBatchErrorAiHandoffInput) => Promise<boolean>
}) {
  const t = useT()
  const locked = pending || startedMode !== null
  const selectableRepositories =
    plan?.members
      .filter((member) => member.ready && member.destinationBranches.some((destination) => destination.ready))
      .map((member) => member.repositoryName) ?? []
  const selectedMembers = plan?.members.filter((member) => selectedRepositories.includes(member.repositoryName)) ?? []
  const hasSelection = selectedMembers.length > 0
  const selectedTargets: BranchWorkspaceBatchMergeOutTargetInput[] = selectedMembers.flatMap((member) => {
    const selectedKey = destinations[member.repositoryName]
    const destination = member.destinationBranches.find(
      (candidate) => repositoryMergeBranchSelectionKey(candidate.destination) === selectedKey,
    )
    return destination ? [{ repositoryName: member.repositoryName, destination: destination.destination }] : []
  })
  const selectionReady =
    hasSelection &&
    selectedTargets.length === selectedMembers.length &&
    selectedMembers.every((member) =>
      member.destinationBranches.some(
        (destination) =>
          repositoryMergeBranchSelectionKey(destination.destination) === destinations[member.repositoryName] &&
          destination.ready,
      ),
    )
  const mergeOnlyReady = selectionReady && selectedTargets.every((target) => target.destination.kind === 'local')
  const remoteReady =
    selectionReady &&
    selectedMembers.every((member) =>
      member.destinationBranches.some(
        (destination) =>
          repositoryMergeBranchSelectionKey(destination.destination) === destinations[member.repositoryName] &&
          destination.pullMergePushReady,
      ),
    )
  const progress =
    plan && startedMode
      ? projectBranchWorkspaceBatchMergeOutProgress(plan, selectedTargets, startedMode, activeOperation, result)
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
        className="max-h-[85vh] w-[calc(100vw-1rem)] max-w-[42.667rem] overflow-y-auto sm:w-[66.667vw] sm:max-w-[42.667rem]"
      >
        <DialogHeader>
          <DialogTitle>{t('workspace.branch-workspace.git-action.batch-merge-out')}</DialogTitle>
          <DialogDescription>
            {t('workspace.branch-workspace.git-action.batch-merge-out-description')}
          </DialogDescription>
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
              >
                <BranchWorkspaceBatchProgress progress={progress} />
              </div>
            ) : null}

            <BatchMergeSelectionSummary
              selectableRepositories={selectableRepositories}
              selectedRepositories={selectedRepositories}
              disabled={locked}
              onSelectedRepositoriesChange={onSelectedRepositoriesChange}
            />

            <div className="overflow-hidden rounded-md border border-separator">
              {plan.members.map((member, index) => {
                const selected = selectedRepositories.includes(member.repositoryName)
                const destination = member.destinationBranches.find(
                  (candidate) =>
                    repositoryMergeBranchSelectionKey(candidate.destination) === destinations[member.repositoryName],
                )
                const destinationUnavailable = !member.destinationBranches.some((candidate) => candidate.ready)
                return (
                  <div
                    key={member.repositoryName}
                    className="grid gap-2 border-b border-separator/60 px-3 py-3 text-xs last:border-b-0"
                  >
                    <div className="grid grid-cols-[1rem_2rem_minmax(0,0.8fr)_minmax(0,1fr)_auto_minmax(12rem,2fr)] items-center gap-2">
                      <Checkbox
                        data-merge-repository={member.repositoryName}
                        checked={selected}
                        disabled={locked || !member.ready || destinationUnavailable}
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
                        {member.targetBranch}
                      </span>
                      <span className="text-muted-foreground/60">→</span>
                      <Select
                        value={destinations[member.repositoryName] ?? ''}
                        disabled={locked || !selected || !member.ready || destinationUnavailable}
                        onValueChange={(value) => onDestinationChange(member.repositoryName, value)}
                      >
                        <SelectTrigger
                          size="sm"
                          data-merge-destination={member.repositoryName}
                          aria-label={t('workspace.branch-workspace.git-action.destination-branch', {
                            repository: member.repositoryName,
                          })}
                          title={destination ? repositoryMergeBranchDisplayName(destination.destination) : undefined}
                          className="min-w-48 w-full max-w-none font-mono text-[10px] *:data-[slot=select-value]:line-clamp-none"
                        >
                          <SelectValue placeholder={t('workspace.branch-workspace.git-action.select-destination')} />
                        </SelectTrigger>
                        <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-max max-w-[min(94vw,37.333rem)]">
                          {member.destinationBranches.map((candidate) => {
                            const key = repositoryMergeBranchSelectionKey(candidate.destination)
                            const name = repositoryMergeBranchDisplayName(candidate.destination)
                            const text =
                              candidate.destination.kind === 'remote' ? `${name} (${t('tab.remote-branches')})` : name
                            return (
                              <SelectItem
                                key={key}
                                value={key}
                                textValue={text}
                                disabled={!candidate.ready}
                                data-merge-destination-option={`${member.repositoryName}:${key}`}
                                data-merge-destination-kind={candidate.destination.kind}
                                className="font-mono text-xs whitespace-normal break-all"
                              >
                                {text}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <span
                        className={cn(
                          'col-start-6 text-right text-[10px] text-muted-foreground',
                          selected && destination && !destination.pullMergePushReady && 'text-warning',
                        )}
                      >
                        {!member.ready
                          ? t(
                              member.message ??
                                'workspace.branch-workspace.git-action.destination-worktree-unavailable',
                            )
                          : !selected
                            ? t('workspace.branch-workspace.git-action.not-selected')
                            : !destination
                              ? t('workspace.branch-workspace.git-action.destination-branch-required')
                              : !destination.ready
                                ? t(
                                    destination.message ??
                                      'workspace.branch-workspace.git-action.destination-worktree-unavailable',
                                  )
                                : !destination.pullMergePushReady
                                  ? t('workspace.branch-workspace.git-action.no-upstream')
                                  : t('workspace.branch-workspace.git-action.ready')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error ? <DialogError>{t(error)}</DialogError> : null}
        <BranchWorkspaceBatchErrorAiActions
          plan={plan}
          result={result}
          onHandoff={onBatchErrorAiHandoff}
          onHandoffComplete={onClose}
        />
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
              {t(result && !result.ok ? 'workspace.branch-workspace.retry' : mergeModeLabel(startedMode, 'out'))}
            </Button>
          ) : plan ? (
            <>
              <Button
                type="button"
                variant="outline"
                data-action="merge"
                disabled={pending || !mergeOnlyReady}
                onClick={() => void onExecute('merge')}
              >
                <GitMerge className="size-4" aria-hidden="true" />
                {t('workspace.branch-workspace.git-action.merge-out')}
              </Button>
              <Button
                type="button"
                data-action="pull-merge-push"
                disabled={pending || !remoteReady}
                onClick={() => void onExecute('pull-merge-push')}
              >
                {t('workspace.branch-workspace.git-action.pull-merge-out-push')}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BranchWorkspaceBatchErrorAiActions({
  plan,
  result,
  onHandoff,
  onHandoffComplete,
}: {
  plan: BranchWorkspaceGitActionPlan | null
  result: BranchWorkspaceGitActionResult | null
  onHandoff: (input: BranchWorkspaceBatchErrorAiHandoffInput) => Promise<boolean>
  onHandoffComplete: () => void
}) {
  const t = useT()
  if (!plan || !result || result.ok) return null
  const failures = result.members.flatMap<BranchWorkspaceBatchErrorAiFailure>((member) => {
    if (member.phase !== 'failed' || !member.step || !member.message) return []
    const worktreePath =
      member.worktreePath ??
      plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)?.targetWorktreePath
    if (!worktreePath) return []
    return [
      {
        repositoryName: member.repositoryName,
        step: member.step,
        message: member.message,
        worktreePath,
        ...(member.reason ? { reason: member.reason } : {}),
        ...(member.conflictWorktree ? { conflictWorktree: member.conflictWorktree } : {}),
      },
    ]
  })
  if (failures.length === 0) return null

  return (
    <div className="grid gap-2">
      <div
        data-slot="branch-workspace-batch-error-summary"
        className="overflow-hidden rounded-md border border-danger-border bg-danger-surface/40"
      >
        <div className="border-b border-danger-border/60 px-3 py-2 text-xs font-medium text-danger">
          {t('workspace.branch-workspace.git-action.member-failure-summary', { count: failures.length })}
        </div>
        {failures.map((failure) => (
          <div
            key={failure.repositoryName}
            data-error-repository={failure.repositoryName}
            className="grid gap-1 border-b border-danger-border/40 px-3 py-2 text-xs last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{failure.repositoryName}</span>
              <span className="ml-auto text-[10px] text-danger">
                {t(`workspace.branch-workspace.git-action.failure-step.${failure.step}`)}
              </span>
            </div>
            <p className="break-words text-[11px] text-muted-foreground">{t(failure.message)}</p>
            <code className="truncate text-[10px] text-muted-foreground" title={failure.worktreePath}>
              {failure.worktreePath}
            </code>
          </div>
        ))}
      </div>
      <MergeConflictAiActions
        title={t('workspace.branch-workspace.git-action.member-failure-ai-handoff')}
        onHandoff={(provider) => onHandoff({ provider, kind: result.kind, failures })}
        onHandoffComplete={onHandoffComplete}
      />
    </div>
  )
}

function BatchDiscardContent({
  plan,
  result,
  activeOperation,
}: {
  plan: BranchWorkspaceBatchDiscardPlan
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
}) {
  const t = useT()
  return (
    <div className="overflow-hidden rounded-md border border-separator">
      {plan.members.map((member, index) => {
        const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
        const activeStep = branchWorkspaceActiveMemberStep(activeOperation, member.repositoryName)
        return (
          <div
            key={member.repositoryName}
            className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem] items-center gap-2 border-b border-separator/60 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            <span className="truncate font-medium">{member.repositoryName}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{member.targetBranch}</span>
            <span className="text-[10px] text-muted-foreground">
              {activeStep
                ? t(`workspace.branch-workspace.git-action.step.${activeStep}`)
                : memberResult
                  ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                  : member.paths.length > 0
                    ? t('workspace.branch-workspace.git-action.change-count', { count: member.changeCount })
                    : t('workspace.branch-workspace.git-action.clean-skipped')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BatchSetUpstreamContent({
  plan,
  result,
  activeOperation,
  pending,
  selectedRepositories,
  upstreams,
  actions,
  queries,
  started,
  onSelectedRepositoriesChange,
  onUpstreamChange,
  onActionChange,
  onQueryChange,
}: {
  plan: BranchWorkspaceBatchSetUpstreamPlan
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  pending: boolean
  selectedRepositories: string[]
  upstreams: Record<string, string>
  actions: Record<string, 'set' | 'unset'>
  queries: Record<string, string>
  started: boolean
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
  onUpstreamChange: (repositoryName: string, remoteRef: string) => void
  onActionChange: (repositoryName: string, action: 'set' | 'unset') => void
  onQueryChange: (repositoryName: string, query: string) => void
}) {
  const t = useT()
  const locked = pending || started
  const selectableRepositories = plan.members
    .filter((member) => member.ready && (member.remoteBranches.length > 0 || member.currentUpstream !== null))
    .map((member) => member.repositoryName)
  const selected = new Set(selectedRepositories)
  const toggleRepository = (repositoryName: string, checked: boolean) => {
    if (locked) return
    onSelectedRepositoriesChange(
      checked
        ? [...new Set([...selectedRepositories, repositoryName])]
        : selectedRepositories.filter((name) => name !== repositoryName),
    )
  }

  return (
    <div className="grid gap-2">
      <BatchMergeSelectionSummary
        selectableRepositories={selectableRepositories}
        selectedRepositories={selectedRepositories}
        disabled={locked}
        onSelectedRepositoriesChange={onSelectedRepositoriesChange}
      />
      <div className="overflow-hidden rounded-md border border-separator">
        {plan.members.map((member, index) => {
          const memberSelected = selected.has(member.repositoryName)
          const selectedRemote = upstreams[member.repositoryName]
          const upstreamAction = actions[member.repositoryName] ?? 'set'
          const selectedCandidate = member.remoteBranches.find((candidate) => candidate.remoteRef === selectedRemote)
          const visibleRemoteBranches = member.remoteBranches.filter((candidate) =>
            remoteBranchRefMatchesQuery(candidate.remoteRef, queries[member.repositoryName] ?? ''),
          )
          const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          const activeStep = branchWorkspaceActiveMemberStep(activeOperation, member.repositoryName)
          const unavailable = !member.ready || (member.remoteBranches.length === 0 && member.currentUpstream === null)
          return (
            <div
              key={member.repositoryName}
              className="grid gap-2 border-b border-separator/60 px-3 py-3 text-xs last:border-b-0"
            >
              <div className="grid grid-cols-[1rem_2rem_minmax(0,0.8fr)_minmax(12rem,2fr)_2rem] items-center gap-2">
                <Checkbox
                  data-upstream-repository={member.repositoryName}
                  checked={memberSelected}
                  disabled={locked || unavailable}
                  aria-label={t('workspace.branch-workspace.git-action.select-member', {
                    repository: member.repositoryName,
                  })}
                  onCheckedChange={(checked) => toggleRepository(member.repositoryName, checked === true)}
                />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-medium">{member.repositoryName}</span>
                <Select
                  value={selectedRemote ?? ''}
                  disabled={locked || !memberSelected || unavailable || upstreamAction === 'unset'}
                  onValueChange={(remoteRef) => onUpstreamChange(member.repositoryName, remoteRef)}
                >
                  <SelectTrigger
                    size="sm"
                    data-upstream-remote={member.repositoryName}
                    aria-label={t('workspace.branch-workspace.git-action.select-upstream-for-member', {
                      repository: member.repositoryName,
                    })}
                    title={selectedCandidate?.remoteRef}
                    className="min-w-48 w-full max-w-none font-mono text-[10px] *:data-[slot=select-value]:line-clamp-none"
                  >
                    <SelectValue placeholder={t('workspace.branch-workspace.git-action.select-upstream')} />
                  </SelectTrigger>
                  <SelectContent
                    matchTriggerWidth
                    header={
                      <RemoteBranchSearchInput
                        id={`branch-workspace-upstream-${member.repositoryName}-filter`}
                        value={queries[member.repositoryName] ?? ''}
                        onChange={(query) => onQueryChange(member.repositoryName, query)}
                        placeholder={t('action.remote-branch-search-placeholder')}
                        ariaLabel={t('action.remote-branch-search-label')}
                        disabled={locked || unavailable}
                      />
                    }
                  >
                    {visibleRemoteBranches.map((candidate) => (
                      <SelectItem
                        key={candidate.remoteRef}
                        value={candidate.remoteRef}
                        textValue={candidate.remoteRef}
                        data-upstream-remote-option={`${member.repositoryName}:${candidate.remoteRef}`}
                        className="font-mono text-xs"
                      >
                        {candidate.remoteRef}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid={`branch-workspace-batch-unset-upstream-${member.repositoryName}`}
                  aria-label={t('workspace.branch-workspace.git-action.remove-upstream')}
                  title={t('workspace.branch-workspace.git-action.remove-upstream')}
                  disabled={locked || !memberSelected || member.currentUpstream === null}
                  onClick={() => onActionChange(member.repositoryName, upstreamAction === 'unset' ? 'set' : 'unset')}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </div>
              <div className="ml-12 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                <span>{member.targetBranch}</span>
                <span className="text-muted-foreground/60">·</span>
                <span data-upstream-current={member.repositoryName} className="break-all font-mono">
                  {t('workspace.branch-workspace.git-action.current-upstream')}:{' '}
                  {member.currentUpstream ?? t('branches.no-upstream')}
                  {member.trackingGone ? ` · ${t('action.branch-upstream-gone')}` : ''}
                </span>
                <span className="text-muted-foreground/60">·</span>
                <span
                  className={cn(!member.ready || (memberSelected && !selectedCandidate) ? 'text-warning' : undefined)}
                >
                  {upstreamAction === 'unset' && memberSelected
                    ? t('workspace.branch-workspace.git-action.remove-upstream-selected')
                    : !member.ready || member.remoteBranches.length === 0
                      ? t(member.message ?? 'workspace.branch-workspace.git-action.remote-branch-required')
                      : !memberSelected
                        ? t('workspace.branch-workspace.git-action.not-selected')
                        : !selectedCandidate
                          ? t('workspace.branch-workspace.git-action.remote-branch-required')
                          : activeStep
                            ? t(`workspace.branch-workspace.git-action.step.${activeStep}`)
                            : memberResult
                              ? t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                              : t('workspace.branch-workspace.git-action.ready')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function mergeModeLabel(mode: BranchWorkspaceMergeMode, direction: 'in' | 'out') {
  return mode === 'merge'
    ? (`workspace.branch-workspace.git-action.merge-${direction}` as const)
    : (`workspace.branch-workspace.git-action.pull-merge-${direction}-push` as const)
}

function SyncContent({
  plan,
  result,
  activeOperation,
  selectedRepositories,
  disabled,
  onSelectedRepositoriesChange,
}: {
  plan: BranchWorkspaceSyncPlan
  result: BranchWorkspaceGitActionResult | null
  activeOperation: BranchWorkspaceActiveOperation | null
  selectedRepositories: string[]
  disabled: boolean
  onSelectedRepositoriesChange: (repositoryNames: string[]) => void
}) {
  const t = useT()
  const selectableRepositories = plan.members.filter((member) => member.ready).map((member) => member.repositoryName)
  const selected = new Set(selectedRepositories)

  const toggleRepository = (repositoryName: string, checked: boolean) => {
    if (disabled) return
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
    <div className="grid gap-2">
      <BatchMergeSelectionSummary
        selectableRepositories={selectableRepositories}
        selectedRepositories={selectedRepositories}
        disabled={disabled}
        onSelectedRepositoriesChange={onSelectedRepositoriesChange}
      />
      <div className="overflow-hidden rounded-md border border-separator">
        {plan.members.map((member, index) => {
          const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          const activeStep = branchWorkspaceActiveMemberStep(activeOperation, member.repositoryName)
          const isSelected = selected.has(member.repositoryName)
          return (
            <div
              key={member.repositoryName}
              className="grid grid-cols-[1rem_2rem_minmax(0,1fr)_minmax(0,1.4fr)_7rem] items-center gap-2 border-b border-separator/60 px-3 py-2.5 text-xs last:border-b-0"
            >
              <Checkbox
                data-sync-repository={member.repositoryName}
                checked={isSelected}
                disabled={disabled || !member.ready}
                aria-label={t('workspace.branch-workspace.git-action.select-member', {
                  repository: member.repositoryName,
                })}
                onCheckedChange={(checked) => toggleRepository(member.repositoryName, checked === true)}
              />
              <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate font-medium">{member.repositoryName}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">{member.targetBranch}</span>
              <span className={cn('text-[10px] text-muted-foreground', !member.ready && 'text-warning')}>
                {activeStep
                  ? t(`workspace.branch-workspace.git-action.step.${activeStep}`)
                  : memberResult
                    ? memberResult.phase === 'not-started' && !isSelected
                      ? t('workspace.branch-workspace.git-action.not-selected')
                      : t(`workspace.branch-workspace.git-action.phase.${memberResult.phase}`)
                    : !member.ready
                      ? t(member.message ?? 'workspace.branch-workspace.git-action.execute-failed')
                      : !isSelected
                        ? t('workspace.branch-workspace.git-action.not-selected')
                        : t('workspace.branch-workspace.git-action.ready')}
              </span>
            </div>
          )
        })}
      </div>
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
  replaceExisting = false,
): Promise<BranchWorkspaceCommitMessageInput[] | null> {
  controllerRef.current?.abort()
  const controller = new AbortController()
  controllerRef.current = controller
  setGeneratingProvider(provider)
  const dirtyMembers = plan.members.filter((member) => member.dirty)

  const results = await Promise.all(
    dirtyMembers.map(async (member) => {
      if (controller.signal.aborted) return null
      const message = await generateMember(
        member,
        provider,
        controller.signal,
        setDrafts,
        setGeneration,
        setErrors,
        replaceExisting,
      )
      return message ? { repositoryName: member.repositoryName, message } : null
    }),
  )

  const messages = results.filter((result): result is BranchWorkspaceCommitMessageInput => result !== null)

  if (controllerRef.current === controller) {
    controllerRef.current = null
    setGeneratingProvider(null)
  }
  return messages.length === dirtyMembers.length && messages.length > 0 ? messages : null
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
  replaceExisting = false,
): Promise<string | null> {
  setGeneration((current) => ({ ...current, [member.repositoryName]: 'generating' }))
  setErrors((current) => ({ ...current, [member.repositoryName]: '' }))
  try {
    const response = await generateRepositoryCommitMessage(member.repoId, member.targetWorktreePath, provider, signal)
    if (signal.aborted) return null
    if (!response.ok) {
      setGeneration((current) => ({ ...current, [member.repositoryName]: 'failed' }))
      setErrors((current) => ({ ...current, [member.repositoryName]: response.message }))
      return null
    }
    const message = response.message.trim()
    if (!message) {
      setGeneration((current) => ({ ...current, [member.repositoryName]: 'failed' }))
      setErrors((current) => ({
        ...current,
        [member.repositoryName]: 'workspace.branch-workspace.git-action.generation-failed',
      }))
      return null
    }
    setDrafts((current) =>
      !replaceExisting && current[member.repositoryName]?.trim()
        ? current
        : { ...current, [member.repositoryName]: message },
    )
    setGeneration((current) => ({ ...current, [member.repositoryName]: 'ready' }))
    return message
  } catch {
    if (signal.aborted) return null
    setGeneration((current) => ({ ...current, [member.repositoryName]: 'failed' }))
    setErrors((current) => ({
      ...current,
      [member.repositoryName]: 'workspace.branch-workspace.git-action.generation-failed',
    }))
    return null
  }
}

function hasAllMessages(
  plan: BranchWorkspaceBatchCommitPlan,
  drafts: Record<string, string>,
  selectedRepositories: string[],
): boolean {
  return (
    selectedRepositories.length > 0 &&
    selectedRepositories.every((repositoryName) => Boolean(drafts[repositoryName]?.trim()))
  )
}
