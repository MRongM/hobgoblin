import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, FolderOpen } from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import type { BranchWorkspaceClonePlan, BranchWorkspaceCloneProgress } from '#/shared/branch-workspace-clone.ts'
import {
  planBranchWorkspaceClone,
  executeBranchWorkspaceClone,
  abortBranchWorkspaceClone,
  readBranchWorkspaceCloneProgress,
} from '#/web/branch-workspace-clone-client.ts'
import { chooseSubworkspaceParentPath, canChooseSubworkspaceParentPath } from '#/web/app-shell-client.ts'
import { subscribeServerInvalidationIngress } from '#/web/server-invalidation-ingress.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { useT } from '#/web/stores/i18n.ts'

export interface BranchWorkspaceCloneTarget {
  rootId: string
  name: string
  repositories?: Array<{ id: string; name: string }>
}

export interface BranchWorkspaceCloneDialogProps {
  open: boolean
  source: BranchWorkspaceSnapshot | null
  targets: BranchWorkspaceCloneTarget[]
  onOpenChange: (open: boolean) => void
  onCloned: (rootId: string, branchWorkspaceId: string) => void | Promise<void>
}

export function BranchWorkspaceCloneDialog({
  open,
  source,
  targets,
  onOpenChange,
  onCloned,
}: BranchWorkspaceCloneDialogProps) {
  const t = useT()
  const [targetRootId, setTargetRootId] = useState('')
  const [parentDirectory, setParentDirectory] = useState('')
  const [directoryName, setDirectoryName] = useState('')
  const [ignoredPaths, setIgnoredPaths] = useState<Record<string, string[]>>({})
  const [mappings, setMappings] = useState<Record<string, { repositoryId: string; branchName: string }>>({})
  const [plan, setPlan] = useState<BranchWorkspaceClonePlan | null>(null)
  const [preview, setPreview] = useState<BranchWorkspaceClonePlan | null>(null)
  const [progress, setProgress] = useState<BranchWorkspaceCloneProgress | null>(null)
  const [busy, setBusy] = useState<'plan' | 'execute' | null>(null)
  const [error, setError] = useState('')
  const initialized = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      initialized.current = null
      return
    }
    if (!source || initialized.current === source.id) return
    initialized.current = source.id
    const target = targets[0]?.rootId ?? ''
    setTargetRootId(target)
    setParentDirectory(target)
    setDirectoryName(source.directoryName)
    setIgnoredPaths({})
    setMappings({})
    setPlan(null)
    setPreview(null)
    setProgress(null)
    setError('')
  }, [open, source, targets])
  useEffect(() => {
    if (!open || !plan || busy !== 'execute') return
    let reading = false
    return subscribeServerInvalidationIngress((event) => {
      if (event.type !== 'workspace-invalidated' || event.rootId !== plan.targetRootId || reading) return
      reading = true
      void readBranchWorkspaceCloneProgress(plan.token)
        .then(setProgress)
        .catch(() => undefined)
        .finally(() => {
          reading = false
        })
    })
  }, [open, plan, busy])
  function changed() {
    setPlan(null)
    setError('')
    setProgress(null)
  }
  async function review() {
    if (!source) return
    setBusy('plan')
    setError('')
    try {
      const result = await planBranchWorkspaceClone({
        sourceRootId: source.rootId,
        sourceBranchWorkspaceId: source.id,
        targetRootId,
        parentDirectory,
        directoryName,
        ignoredPaths,
        mappings,
      })
      if (!result.ok) {
        setError(result.detail || t(result.message))
        return
      }
      setPlan(result.plan)
      setPreview(result.plan)
    } catch (failure) {
      setError(String(failure))
    } finally {
      setBusy(null)
    }
  }
  async function execute() {
    if (!plan) return
    setBusy('execute')
    setError('')
    try {
      const result = await executeBranchWorkspaceClone(plan.token)
      if (!result.ok) {
        setError(result.detail || t(result.message))
        setProgress(await readBranchWorkspaceCloneProgress(plan.token))
        return
      }
      await onCloned(result.rootId, result.branchWorkspaceId)
      onOpenChange(false)
    } catch (failure) {
      setError(String(failure))
    } finally {
      setBusy(null)
    }
  }
  function ignoredFor(name: string): string[] {
    return Object.hasOwn(ignoredPaths, name) ? ignoredPaths[name]! : []
  }
  const target = targets.find((candidate) => candidate.rootId === targetRootId)
  const locked = Boolean(busy) || Boolean(progress && ['failed', 'cancelled'].includes(progress.phase))
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('workspace.branch-workspace.clone.title')}</DialogTitle>
          <DialogDescription>{t('workspace.branch-workspace.clone.scope')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-md border p-3 text-sm break-all">{source?.path}</div>
          <label className="grid gap-1 text-sm">
            {t('workspace.branch-workspace.clone.target')}
            <select
              className="h-9 rounded-md border bg-background px-3"
              disabled={locked}
              value={targets.some((item) => item.rootId === targetRootId) ? targetRootId : ''}
              onChange={(event) => {
                setTargetRootId(event.target.value)
                setParentDirectory(event.target.value)
                setMappings({})
                changed()
              }}
            >
              <option value="">{t('workspace.branch-workspace.clone.select-target')}</option>
              {targets.map((item) => (
                <option key={item.rootId} value={item.rootId}>
                  {item.name} — {item.rootId}
                </option>
              ))}
            </select>
            <Input
              disabled={locked}
              value={targetRootId}
              onChange={(event) => {
                if (!parentDirectory || parentDirectory === targetRootId) setParentDirectory(event.target.value)
                setTargetRootId(event.target.value)
                setMappings({})
                changed()
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('workspace.branch-workspace.clone.storage')}
            <div className="flex gap-2">
              <Input
                disabled={locked}
                value={parentDirectory}
                onChange={(event) => {
                  setParentDirectory(event.target.value)
                  changed()
                }}
              />
              {canChooseSubworkspaceParentPath() && (
                <Button
                  variant="outline"
                  size="icon"
                  disabled={locked}
                  aria-label={t('workspace.branch-workspace.clone.browse')}
                  onClick={() => {
                    void chooseSubworkspaceParentPath(t('workspace.branch-workspace.clone.storage'))
                      .then((value) => {
                        if (value) {
                          setParentDirectory(value)
                          changed()
                        }
                      })
                      .catch((failure) => setError(String(failure)))
                  }}
                >
                  <FolderOpen className="size-4" />
                </Button>
              )}
            </div>
          </label>
          <label className="grid gap-1 text-sm">
            {t('workspace.branch-workspace.clone.folder')}
            <Input
              disabled={locked}
              value={directoryName}
              onChange={(event) => {
                setDirectoryName(event.target.value)
                changed()
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t('workspace.branch-workspace.clone.server-local')}</p>
          {(source?.repositories ?? []).map((member) => {
            const inspected = preview?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
            const mapping = Object.hasOwn(mappings, member.repositoryName) ? mappings[member.repositoryName] : undefined
            return (
              <div key={member.repositoryName} className="grid gap-2 rounded-md border p-3 text-sm">
                <div className="font-medium">{member.repositoryName}</div>
                <label className="grid gap-1">
                  {t('workspace.branch-workspace.clone.mode')}
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    disabled={locked}
                    value={mapping?.repositoryId ?? ''}
                    onChange={(event) => {
                      setMappings((previous) => {
                        const next = Object.assign(Object.create(null) as typeof previous, previous)
                        if (!event.target.value) delete next[member.repositoryName]
                        else
                          next[member.repositoryName] = {
                            repositoryId: event.target.value,
                            branchName:
                              inspected?.snapshot.repository?.branch ??
                              member.currentBranch ??
                              member.targetBranch ??
                              '',
                          }
                        return next
                      })
                      changed()
                    }}
                  >
                    <option value="">{t('workspace.branch-workspace.clone.independent')}</option>
                    {target?.repositories?.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {t('workspace.branch-workspace.clone.worktree')} — {repo.name}
                      </option>
                    ))}
                  </select>
                </label>
                {mapping && (
                  <>
                    <label className="grid gap-1">
                      {t('workspace.branch-workspace.clone.branch')}
                      <Input
                        value={mapping.branchName}
                        disabled={locked}
                        onChange={(event) => {
                          setMappings((previous) => ({
                            ...previous,
                            [member.repositoryName]: { ...mapping, branchName: event.target.value },
                          }))
                          changed()
                        }}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {t('workspace.branch-workspace.clone.mapping-note')}
                    </p>
                  </>
                )}
                {inspected && (
                  <div className="text-xs break-all text-muted-foreground">
                    {inspected.snapshot.repository?.branch ?? t('workspace.branch-workspace.clone.detached')} ·{' '}
                    {inspected.snapshot.repository?.head.slice(0, 12)} · {inspected.snapshot.entries.length}{' '}
                    {t('workspace.branch-workspace.clone.files')}
                  </div>
                )}
                {inspected && inspected.snapshot.ignoredPaths.length > 0 && (
                  <details>
                    <summary>{t('workspace.branch-workspace.clone.ignored')}</summary>
                    <div className="mt-2 max-h-40 overflow-y-auto grid gap-1">
                      {inspected.snapshot.ignoredPaths.map((filename) => (
                        <label key={filename} className="flex items-start gap-2 break-all">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={ignoredFor(member.repositoryName).includes(filename)}
                            onChange={(event) => {
                              setIgnoredPaths((previous) => ({
                                ...previous,
                                [member.repositoryName]: event.target.checked
                                  ? [
                                      ...(Object.hasOwn(previous, member.repositoryName)
                                        ? previous[member.repositoryName]!
                                        : []),
                                      filename,
                                    ]
                                  : (Object.hasOwn(previous, member.repositoryName)
                                      ? previous[member.repositoryName]!
                                      : []
                                    ).filter((entry) => entry !== filename),
                              }))
                              changed()
                            }}
                          />
                          {filename}
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
          {plan && (
            <div className="rounded-md border p-3 text-sm break-all">
              <div>
                {t('workspace.branch-workspace.clone.destination')}: {plan.path}
              </div>
              <div>
                {t('workspace.branch-workspace.clone.root-files')}: {plan.rootSnapshot?.entries.length ?? 0}
              </div>
            </div>
          )}
          {busy && (
            <div role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              {busy === 'plan'
                ? t('workspace.branch-workspace.clone.inspecting')
                : t('workspace.branch-workspace.clone.running')}
              {progress && (
                <span>
                  {progress.repositoryName} · {progress.completedRepositoryNames.length}/{plan?.members.length} ·{' '}
                  {(progress.transferredBytes / 1024 / 1024).toFixed(1)} MiB
                </span>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          {busy ? (
            <Button
              variant="outline"
              onClick={() => {
                void abortBranchWorkspaceClone(targetRootId)
              }}
            >
              {t('workspace.branch-workspace.clone.cancel')}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('workspace.branch-workspace.clone.close')}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={locked || !targetRootId || !parentDirectory || !directoryName}
            onClick={() => {
              void review()
            }}
          >
            {t('workspace.branch-workspace.clone.preview')}
          </Button>
          <Button
            disabled={Boolean(busy) || !plan}
            onClick={() => {
              void execute()
            }}
          >
            {progress?.phase === 'failed' || progress?.phase === 'cancelled'
              ? t('workspace.branch-workspace.clone.retry')
              : t('workspace.branch-workspace.clone.execute')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
