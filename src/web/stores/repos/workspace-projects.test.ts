import { describe, expect, test } from 'vitest'
import {
  activeProjectId,
  projectActivationTarget,
  projectRepositoryIds,
  workspaceActiveContext,
  workspaceRepositoryListExpanded,
  workspaceRootIdForRepo,
} from '#/web/stores/repos/workspace-projects.ts'
import type { WorkspaceActiveContext } from '#/shared/rpc.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'
const SOLO = '/solo'

function createState(
  activeId: string | null = API,
  savedContext: WorkspaceActiveContext = { kind: 'repository', repositoryId: WEB },
) {
  return {
    activeId,
    repos: {
      [ROOT]: { id: ROOT },
      [API]: { id: API, workspaceRootId: ROOT },
      [WEB]: { id: WEB, workspaceRootId: ROOT },
      [SOLO]: { id: SOLO },
    },
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [],
        configured: false,
        configurationError: null,
        phase: 'ready' as const,
        skipped: [],
        error: null,
      },
    },
    workspaceActiveContextByRoot: {
      [ROOT]: savedContext,
    },
    workspaceRepositoryListExpandedByRoot: {} as Record<string, boolean>,
  }
}

describe('workspace project selectors', () => {
  test('maps a visible child repository back to its top-level project', () => {
    const state = createState(API)

    expect(workspaceRootIdForRepo(state, API)).toBe(ROOT)
    expect(activeProjectId(state)).toBe(ROOT)
  })

  test('keeps ordinary repositories as their own top-level projects', () => {
    const state = createState(SOLO)

    expect(workspaceRootIdForRepo(state, SOLO)).toBeNull()
    expect(activeProjectId(state)).toBe(SOLO)
  })

  test('restores the saved repository when activating a workspace project', () => {
    const state = createState(SOLO, { kind: 'repository', repositoryId: WEB })

    expect(projectActivationTarget(state, ROOT)).toBe(WEB)
    expect(projectRepositoryIds(state, ROOT)).toEqual([API, WEB])
  })

  test('uses Overview when the saved repository is stale or explicitly Overview', () => {
    expect(
      projectActivationTarget(
        createState(SOLO, { kind: 'repository', repositoryId: '/workspace/removed' }),
        ROOT,
      ),
    ).toBe(ROOT)
    expect(projectActivationTarget(createState(SOLO, { kind: 'overview' }), ROOT)).toBe(ROOT)
  })

  test('restores a query-confirmed branch workspace and rejects a deleting one', () => {
    const state = createState(SOLO, { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' })
    const ready = branchWorkspace('ready')
    expect(workspaceActiveContext(state, ROOT, [ready])).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
    })
    expect(projectActivationTarget(state, ROOT, [ready])).toBe(ROOT)
    expect(workspaceActiveContext(state, ROOT, [branchWorkspace('delete-incomplete')])).toEqual({ kind: 'overview' })
  })

  test('defaults repository lists to expanded and preserves explicit per-root values', () => {
    const state = createState()
    expect(workspaceRepositoryListExpanded(state, ROOT)).toBe(true)
    state.workspaceRepositoryListExpandedByRoot[ROOT] = false
    expect(workspaceRepositoryListExpanded(state, ROOT)).toBe(false)
  })

  test('returns null when no resource is active', () => {
    expect(activeProjectId(createState(null))).toBeNull()
  })
})

function branchWorkspace(lifecycle: 'ready' | 'delete-incomplete') {
  return {
    id: 'branch-1',
    rootId: ROOT,
    branch: 'feature/auth',
    directoryName: 'goblin-feature',
    path: `${ROOT}/goblin-feature`,
    lifecycle,
    available: lifecycle === 'ready',
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
    ...(lifecycle === 'delete-incomplete'
      ? { operation: { kind: 'remove' as const, phase: 'failed' as const, startedAt: '2026-07-21T00:00:00.000Z' } }
      : {}),
  }
}
