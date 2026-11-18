import { useEffect, useId, useRef, useState } from 'react'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import type {
  WorktreeDependencyCandidate,
  WorktreeDependencyPlan,
  WorktreeDependencyPlanRequest,
} from '#/shared/worktree-dependencies.ts'
import { isAbsoluteWorktreePath } from '#/shared/worktree-create.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import {
  abortWorktreeDependencies,
  executeWorktreeDependencies,
  planWorktreeDependencies,
  readWorktreeDependencies,
} from '#/web/worktree-dependency-client.ts'
import { useLatestPlanRequest } from '#/web/hooks/useLatestPlanRequest.ts'
import {
  MaterializationCandidateList,
  type MaterializationCandidateChoice,
} from '#/web/components/MaterializationCandidateList.tsx'
import {
  OneStepPlanningLayout,
  OneStepPlanningPlanPane,
  OneStepPlanningSelectionPane,
} from '#/web/components/repo-workspace/OneStepPlanningLayout.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { Field, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface Props {
  open: boolean
  operation: 'add' | 'remove'
  repoId: string
  worktreePath: string
  sourceWorktrees: Array<{ path: string; branch: string }>
  onOpenChange: (open: boolean) => void
  onCompleted: () => void | Promise<void>
}

export function WorktreeDependencyDialog({
  open,
  operation,
  repoId,
  worktreePath,
  sourceWorktrees,
  onOpenChange,
  onCompleted,
}: Props) {
  const t = useT()
  const id = useId()
  const [source, setSource] = useState('')
  const [candidates, setCandidates] = useState<WorktreeDependencyCandidate[]>([])
  const [choices, setChoices] = useState<Record<string, MaterializationCandidateChoice>>({})
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [reading, setReading] = useState(false)
  const [readKey, setReadKey] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [plan, setPlan] = useState<WorktreeDependencyPlan | null>(null)
  const [plannedKey, setPlannedKey] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [completed, setCompleted] = useState<string[]>([])
  const closeAfterExecution = useRef(false)
  const sources = sourceWorktrees.filter((entry) => !sameLocalFilePath(entry.path, worktreePath))
  const initialSource = useRef('')
  initialSource.current = sources[0]?.path ?? ''

  useEffect(() => {
    if (!open) return
    setSource(initialSource.current)
    setChoices({})
    setSelected(new Set())
    setCandidates([])
    setReadKey(null)
    setReadError(null)
    setPlan(null)
    setPlannedKey(null)
    setPlanError(null)
    setExecutionError(null)
    setCompleted([])
    setCancelling(false)
    closeAfterExecution.current = false
  }, [open, operation, repoId, worktreePath])

  const sourceValid = operation === 'remove' || isAbsoluteWorktreePath(source.trim())
  const input = {
    repoId,
    worktreePath,
    operation,
    ...(operation === 'add' ? { sourceWorktreePath: source.trim() } : {}),
  }
  const inputKey = JSON.stringify(input)
  useEffect(() => {
    if (!open || executing) return
    if (!sourceValid) {
      setReading(false)
      setReadKey(null)
      setCandidates([])
      setReadError(null)
      return
    }
    const controller = new AbortController()
    setReading(true)
    setReadKey(null)
    setReadError(null)
    setPlan(null)
    setPlannedKey(null)
    const timer = setTimeout(() => {
      void readWorktreeDependencies(input, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          if (!result.ok) {
            setCandidates([])
            setReadError(result.message)
            return
          }
          setCandidates(result.candidates)
          setReadKey(inputKey)
          const available = new Set(
            result.candidates
              .filter((entry) => operation === 'remove' || !entry.targetExists)
              .map((entry) => entry.path),
          )
          setChoices((current) => Object.fromEntries(Object.entries(current).filter(([path]) => available.has(path))))
          setSelected((current) => new Set([...current].filter((path) => available.has(path))))
        })
        .catch(() => {
          if (!controller.signal.aborted) setReadError('worktree-dependencies.read-failed')
        })
        .finally(() => {
          if (!controller.signal.aborted) setReading(false)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, inputKey, sourceValid, revision, executing])

  const readReady = !reading && readKey === inputKey && sourceValid
  const effectiveChoices: Record<string, MaterializationCandidateChoice> = Object.fromEntries(
    candidates.map((entry) => [entry.path, entry.targetExists ? 'skip' : (choices[entry.path] ?? 'symlink')]),
  )
  const entries = candidates.flatMap((entry) => {
    const mode = effectiveChoices[entry.path]
    return !entry.targetExists && (mode === 'copy' || mode === 'symlink') ? [{ path: entry.path, mode }] : []
  })
  const paths = candidates.filter((entry) => selected.has(entry.path)).map((entry) => entry.path)
  const request: WorktreeDependencyPlanRequest | null =
    open && readReady && !executing
      ? operation === 'add'
        ? entries.length > 0
          ? { repoId, worktreePath, operation, sourceWorktreePath: source.trim(), entries }
          : null
        : paths.length > 0
          ? { repoId, worktreePath, operation, paths }
          : null
      : null
  const requestKey = request ? JSON.stringify(request) : null
  const autoPlan = useLatestPlanRequest({
    enabled: open && readReady && !executing,
    request,
    requestKey,
    revision,
    debounceMs: 150,
    requestPlan: async (next, signal) => {
      setPlanError(null)
      const result = await planWorktreeDependencies(next, signal).catch(() => ({
        ok: false as const,
        message: 'worktree-dependencies.failed',
      }))
      if (signal?.aborted) return false
      if (!result.ok) {
        setPlanError(result.message)
        return false
      }
      setPlan(result.plan)
      setPlannedKey(JSON.stringify(next))
      return true
    },
  })
  const planReady = !!plan && autoPlan.status === 'ready' && requestKey !== null && plannedKey === requestKey
  const visiblePlan = executing || planReady ? plan : null

  function changeSource(value: string) {
    setSource(value)
    setChoices({})
    setSelected(new Set())
    setPlanError(null)
    setExecutionError(null)
  }

  async function close() {
    if (!executing) {
      onOpenChange(false)
      return
    }
    if (cancelling) return
    closeAfterExecution.current = true
    setCancelling(true)
    try {
      const result = await abortWorktreeDependencies({ repoId, worktreePath })
      if (!result.ok) {
        closeAfterExecution.current = false
        setExecutionError('worktree-dependencies.failed')
      }
    } catch {
      closeAfterExecution.current = false
      setExecutionError('worktree-dependencies.failed')
    } finally {
      setCancelling(false)
    }
  }

  async function execute() {
    if (!plan || !planReady || executing) return
    setExecuting(true)
    setExecutionError(null)
    try {
      const result = await executeWorktreeDependencies(plan.token)
      setCompleted((current) => [...new Set([...current, ...result.completedPaths])])
      const finished = new Set(result.completedPaths)
      setChoices((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !finished.has(path))))
      setSelected((current) => new Set([...current].filter((path) => !finished.has(path))))
      if (result.completedPaths.length > 0 || result.ok) await Promise.resolve(onCompleted()).catch(() => undefined)
      if (result.ok || closeAfterExecution.current) onOpenChange(false)
      else setExecutionError(result.message)
    } catch {
      setExecutionError('worktree-dependencies.failed')
      if (closeAfterExecution.current) onOpenChange(false)
    } finally {
      setPlan(null)
      setPlannedKey(null)
      setReadKey(null)
      setRevision((value) => value + 1)
      setExecuting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else void close()
      }}
    >
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t(`worktree-dependencies.${operation}.title`)}</DialogTitle>
          <DialogDescription>{t(`worktree-dependencies.${operation}.description`)}</DialogDescription>
        </DialogHeader>
        <OneStepPlanningLayout enabled testIdPrefix="worktree-dependencies">
          <OneStepPlanningSelectionPane
            enabled
            testIdPrefix="worktree-dependencies"
            title={t(`worktree-dependencies.${operation}.action`)}
          >
            {operation === 'add' ? (
              <Field>
                <FieldLabel htmlFor={`${id}-source`}>{t('worktree-dependencies.source')}</FieldLabel>
                {sources.length > 0 ? (
                  <select
                    className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label={t('worktree-dependencies.source-worktree')}
                    value={sources.some((entry) => entry.path === source) ? source : ''}
                    disabled={executing}
                    onChange={(event) => changeSource(event.target.value)}
                  >
                    <option value="">{t('worktree-dependencies.custom-source')}</option>
                    {sources.map((entry) => (
                      <option key={entry.path} value={entry.path}>
                        {entry.branch || entry.path} · {entry.path}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Input
                  id={`${id}-source`}
                  value={source}
                  disabled={executing}
                  placeholder={t('worktree-dependencies.source-placeholder')}
                  className="font-mono text-xs"
                  onChange={(event) => changeSource(event.target.value)}
                />
                {source && !sourceValid ? <FieldError>{t('worktree-dependencies.invalid-source')}</FieldError> : null}
              </Field>
            ) : null}
            <div className="flex items-center gap-2 text-xs">
              {reading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  {t('worktree-dependencies.loading')}
                </>
              ) : null}
              <Button
                className="ml-auto"
                type="button"
                variant="ghost"
                size="sm"
                disabled={executing || reading || !sourceValid}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshCw aria-hidden="true" />
                {t('worktree-dependencies.refresh')}
              </Button>
            </div>
            {operation === 'add' ? (
              <MaterializationCandidateList
                key={inputKey}
                headingId={`${id}-candidates`}
                label={t('worktree-dependencies.add.action')}
                emptyMessage={t('worktree-dependencies.empty')}
                items={(readReady ? candidates : []).map((entry) => ({
                  id: entry.path,
                  label: entry.path,
                  kind: entry.kind === 'directory' ? 'directory' : 'file',
                  disabled: entry.targetExists,
                  annotation: entry.targetExists ? (
                    <span className="text-[10px] text-muted-foreground">
                      {t('worktree-dependencies.target-exists')}
                    </span>
                  ) : null,
                }))}
                choices={effectiveChoices}
                disabled={executing || !readReady}
                onChoiceChange={(path, choice) => setChoices((current) => ({ ...current, [path]: choice }))}
              />
            ) : (
              <div className="grid gap-2 rounded-md border border-separator p-3">
                {readReady && candidates.length > 0 ? (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      aria-label={t('action.materialization-select-all')}
                      disabled={executing}
                      checked={paths.length === 0 ? false : paths.length === candidates.length ? true : 'indeterminate'}
                      onCheckedChange={(value) =>
                        setSelected(value === true ? new Set(candidates.map((entry) => entry.path)) : new Set())
                      }
                    />
                    {t('action.materialization-select-all')}
                  </label>
                ) : null}
                {readReady && candidates.length > 0 ? (
                  candidates.map((entry) => (
                    <label key={entry.path} className="flex min-w-0 items-center gap-2 text-xs">
                      <Checkbox
                        checked={selected.has(entry.path)}
                        disabled={executing}
                        onCheckedChange={(value) =>
                          setSelected((current) => {
                            const next = new Set(current)
                            if (value === true) next.add(entry.path)
                            else next.delete(entry.path)
                            return next
                          })
                        }
                      />
                      <code className="min-w-0 flex-1 break-all">{entry.path}</code>
                      <span className="shrink-0 text-muted-foreground">
                        {t(
                          entry.kind === 'symlink'
                            ? 'worktree-dependencies.remove-link'
                            : 'worktree-dependencies.remove-files',
                        )}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">{t('worktree-dependencies.empty')}</p>
                )}
              </div>
            )}
            {readError ? <FieldError role="alert">{t(readError)}</FieldError> : null}
          </OneStepPlanningSelectionPane>
          <OneStepPlanningPlanPane enabled testIdPrefix="worktree-dependencies" title={t('worktree-dependencies.plan')}>
            <div className="grid gap-1 rounded-md bg-muted/30 p-3 text-xs">
              <span className="text-muted-foreground">{t('worktree-dependencies.target')}</span>
              <code className="break-all">{worktreePath}</code>
            </div>
            {visiblePlan ? (
              <ul className="divide-y rounded-md border border-separator">
                {visiblePlan.entries.map((entry) => (
                  <li key={entry.path} className="grid gap-1 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="min-w-0 break-all">{entry.path}</code>
                      <span className="shrink-0 text-muted-foreground">
                        {t(
                          entry.mode
                            ? `worktree-dependencies.${entry.mode}`
                            : entry.kind === 'symlink'
                              ? 'worktree-dependencies.remove-link'
                              : 'worktree-dependencies.remove-files',
                        )}
                      </span>
                    </div>
                    {entry.sourcePath ? (
                      <code className="break-all text-[10px] text-muted-foreground">{entry.sourcePath}</code>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-xs text-muted-foreground">
                {t(
                  autoPlan.status === 'planning'
                    ? 'workspace.branch-workspace.one-step.planning'
                    : 'workspace.branch-workspace.one-step.incomplete',
                )}
              </p>
            )}
            {executing ? (
              <div role="status" className="flex items-center gap-2 text-xs">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t(operation === 'add' ? 'worktree-dependencies.confirm-add' : 'worktree-dependencies.confirm-remove')}
              </div>
            ) : null}
            {completed.length > 0 ? (
              <div className="grid gap-1 text-xs">
                <p>{t('worktree-dependencies.partial', { count: completed.length })}</p>
                {completed.map((path) => (
                  <div className="flex items-center gap-2" key={path}>
                    <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                    <code className="break-all">{path}</code>
                  </div>
                ))}
              </div>
            ) : null}
            {planError ? <FieldError role="alert">{t(planError)}</FieldError> : null}
            {executionError ? <FieldError role="alert">{t(executionError)}</FieldError> : null}
          </OneStepPlanningPlanPane>
        </OneStepPlanningLayout>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={cancelling} onClick={() => void close()}>
            {t('dialog.cancel')}
          </Button>
          <Button
            type="button"
            variant={operation === 'remove' ? 'destructive' : 'default'}
            disabled={!planReady || executing}
            onClick={() => void execute()}
          >
            {executing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t(operation === 'add' ? 'worktree-dependencies.confirm-add' : 'worktree-dependencies.confirm-remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
