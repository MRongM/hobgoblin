// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  abort: vi.fn(),
  applyWorkspaceDiscoveryResult: vi.fn(),
  activateOverview: vi.fn(),
  invalidateQueries: vi.fn(),
  clearQueries: vi.fn(),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  planWorkspaceRecovery: mocks.plan,
  executeWorkspaceRecovery: mocks.execute,
  abortWorkspaceRecovery: mocks.abort,
}))
vi.mock('#/web/stores/repos/lifecycle-write-paths.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/web/stores/repos/lifecycle-write-paths.ts')>()),
  applyWorkspaceDiscoveryResult: mocks.applyWorkspaceDiscoveryResult,
}))
vi.mock('#/web/stores/repos/invalidation-sources.ts', () => ({
  runWithRepoInvalidationSource: (_prefix: string, task: (sourceToken: string) => Promise<unknown>) =>
    task('workspace_recovery_1'),
}))
vi.mock('#/web/main-window-queries.ts', () => ({
  mainWindowQueryClient: {
    invalidateQueries: mocks.invalidateQueries,
    clear: mocks.clearQueries,
  },
}))
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}))

import { useWorkspaceConfigurationRecovery } from '#/web/hooks/useWorkspaceConfigurationRecovery.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

const ROOT = '/workspace'
const TOKEN = `sha256:${'1'.repeat(64)}`
const workspace: WorkspaceProjectState = {
  rootId: ROOT,
  repositoryIds: [`${ROOT}/missing`],
  candidates: [{ id: `${ROOT}/missing`, name: 'missing', selected: true, available: false }],
  configured: true,
  configuredRepositoryNames: ['missing'],
  configurationError: null,
  phase: 'ready',
  skipped: [],
  error: null,
}
const recoveredWorkspace = {
  ok: true as const,
  rootId: ROOT,
  repositories: [{ id: `${ROOT}/api`, name: 'api' }],
  candidates: [{ id: `${ROOT}/api`, name: 'api', selected: true, available: true }],
  configuration: { kind: 'ready' as const, config: { repo: ['api'] } },
  skipped: [],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  vi.resetAllMocks()
  useReposStore.setState({ activateWorkspaceOverview: mocks.activateOverview })
  mocks.plan.mockResolvedValue({
    ok: true,
    plan: {
      token: TOKEN,
      rootId: ROOT,
      cleanupScope: 'project',
      branchWorkspaces: [],
      configuredRepositoryNames: ['missing'],
      discoveredRepositoryNames: ['api'],
    },
  })
  mocks.abort.mockResolvedValue({ ok: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useWorkspaceConfigurationRecovery', () => {
  test('previews recovery without activating the project', async () => {
    renderHarness()

    await click('[data-testid="workspace-recovery-action"]')

    expect(mocks.plan).toHaveBeenCalledWith(ROOT)
    expect(mocks.activateOverview).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="workspace-recovery-dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('workspace.recovery.confirm-summary')
  })

  test('discloses every approval granted to ordinary branch workspace removal', async () => {
    mocks.plan.mockResolvedValueOnce({
      ok: true,
      plan: {
        token: TOKEN,
        rootId: ROOT,
        cleanupScope: 'project',
        branchWorkspaces: [
          {
            id: 'branch-1',
            branch: 'feature/example',
            path: '/workspace/feature-example',
            mode: 'remove',
            requiredApprovals: ['discard-member-changes', 'close-terminals'],
          },
        ],
        configuredRepositoryNames: ['missing'],
        discoveredRepositoryNames: ['api'],
      },
    })
    renderHarness()

    await click('[data-testid="workspace-recovery-action"]')

    expect(document.body.textContent).toContain('workspace.branch-workspace.approvals')
    expect(document.body.textContent).toContain('workspace.branch-workspace.approval.discard-member-changes')
    expect(document.body.textContent).toContain('workspace.branch-workspace.approval.close-terminals')
  })

  test('executes once with a source token, applies the snapshot, and activates Overview', async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      outcome: 'completed',
      workspace: recoveredWorkspace,
      branches: [],
    })
    renderHarness()
    await click('[data-testid="workspace-recovery-action"]')

    await click('[data-testid="workspace-recovery-confirm"]')
    await click('[data-testid="workspace-recovery-confirm"]')

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.execute).toHaveBeenCalledWith(ROOT, {
      planToken: TOKEN,
      sourceToken: 'workspace_recovery_1',
    })
    expect(mocks.applyWorkspaceDiscoveryResult).toHaveBeenCalledWith(
      useReposStore.setState,
      useReposStore.getState,
      ROOT,
      recoveredWorkspace,
    )
    expect(mocks.activateOverview).toHaveBeenCalledWith(ROOT)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['branch-workspaces', ROOT],
      exact: true,
    })
    expect(document.body.textContent).toContain('workspace.recovery.result-success')
  })

  test('aborts a pending execution without applying later stages', async () => {
    let finish: ((value: { ok: false; message: string; cancelled: true }) => void) | undefined
    mocks.execute.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    renderHarness()
    await click('[data-testid="workspace-recovery-action"]')
    await click('[data-testid="workspace-recovery-confirm"]')

    await click('[data-testid="workspace-recovery-cancel"]')
    expect(mocks.abort).toHaveBeenCalledWith(ROOT)
    await act(async () => {
      finish?.({ ok: false, message: 'workspace.recovery.cancelled', cancelled: true })
      await Promise.resolve()
    })

    expect(mocks.applyWorkspaceDiscoveryResult).not.toHaveBeenCalled()
    expect(mocks.activateOverview).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('workspace.recovery.cancelled')
  })

  test('keeps residual and hard-failure outcomes visible', async () => {
    mocks.execute.mockResolvedValueOnce({
      ok: true,
      outcome: 'completed-with-residuals',
      workspace: recoveredWorkspace,
      branches: [
        {
          id: 'branch-1',
          branch: 'feature/example',
          outcome: 'record-removed',
          message: 'workspace.branch-workspace.remove-failed',
        },
      ],
    })
    renderHarness()
    await click('[data-testid="workspace-recovery-action"]')
    expect(mocks.plan).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-testid="workspace-recovery-dialog"]')).not.toBeNull()
    await click('[data-testid="workspace-recovery-confirm"]')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('workspace.recovery.result-residual')
    expect(document.body.textContent).toContain('feature/example')

    await click('[data-testid="workspace-recovery-close"]')
    mocks.execute.mockResolvedValueOnce({ ok: false, message: 'workspace.recovery.failed' })
    await click('[data-testid="workspace-recovery-action"]')
    await click('[data-testid="workspace-recovery-confirm"]')
    expect(document.body.textContent).toContain('workspace.recovery.result-failed')
    expect(document.body.textContent).toContain('workspace.recovery.failed')
  })
})

function renderHarness(): void {
  act(() => root.render(<Harness />))
}

function Harness() {
  const recovery = useWorkspaceConfigurationRecovery({ rootId: ROOT, workspace })
  return (
    <>
      {recovery.visible ? (
        <button
          data-testid="workspace-recovery-action"
          disabled={recovery.contextAction.disabled}
          onClick={recovery.contextAction.onSelect}
        />
      ) : null}
      {recovery.dialog}
    </>
  )
}

async function click(selector: string): Promise<void> {
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>(selector)?.click()
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}
