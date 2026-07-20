import { describe, expect, test } from 'vitest'
import {
  activeProjectId,
  projectActivationTarget,
  projectRepositoryIds,
  workspaceRootIdForRepo,
} from '#/web/stores/repos/workspace-projects.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'
const SOLO = '/solo'

function createState(activeId: string | null = API, savedSelection: string | null = WEB) {
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
    workspaceActiveRepoByRoot: {
      [ROOT]: savedSelection,
    },
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
    const state = createState(SOLO, WEB)

    expect(projectActivationTarget(state, ROOT)).toBe(WEB)
    expect(projectRepositoryIds(state, ROOT)).toEqual([API, WEB])
  })

  test('uses Overview when the saved repository is stale or explicitly null', () => {
    expect(projectActivationTarget(createState(SOLO, '/workspace/removed'), ROOT)).toBe(ROOT)
    expect(projectActivationTarget(createState(SOLO, null), ROOT)).toBe(ROOT)
  })

  test('returns null when no resource is active', () => {
    expect(activeProjectId(createState(null))).toBeNull()
  })
})
