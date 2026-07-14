import { beforeEach, describe, expect, test } from 'vitest'
import { restoreRepoProjectionFromSnapshot, normalizeRestorableRepoCache, persistRestorableRepoSnapshot, rememberedQuickActions } from '#/web/stores/repos/persistence.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import {
  createBranchSnapshot,
  createRepoBranch,
  resetReposStore,
  seedRepoState,
} from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RestorableRepoSnapshot } from '#/web/stores/repos/types.ts'
import { DEFAULT_FILE_TREE_PANE_SIZES } from '#/shared/workspace-layout.ts'
function cachedRepo(savedAt: number): RestorableRepoSnapshot {
  return {
    savedAt,
    name: 'repo',
    data: {
      branches: [],
      currentBranch: '',
    },
    ui: {
      selectedBranch: null,
      detailTab: 'status',
      worktreePathOrder: [],
    },
  }
}

beforeEach(() => {
  resetReposStore()
  rememberedQuickActions.clear()
})

describe('normalizeRestorableRepoCache', () => {
  test('keeps only the newest 50 valid cache entries', () => {
    const now = Date.now()
    const raw = Object.fromEntries(
      Array.from({ length: 55 }, (_, index) => [`/repo-${index}`, cachedRepo(now + index)]),
    )

    const normalized = normalizeRestorableRepoCache(raw)

    expect(Object.keys(normalized)).toHaveLength(50)
    expect(normalized['/repo-0']).toBeUndefined()
    expect(normalized['/repo-4']).toBeUndefined()
    expect(normalized['/repo-5']).toBeDefined()
    expect(Object.keys(normalized)[0]).toBe('/repo-54')
  })

  test('drops expired and invalid cache entries', () => {
    const now = Date.now()
    const normalized = normalizeRestorableRepoCache({
      fresh: cachedRepo(now),
      expired: cachedRepo(now - 15 * 24 * 60 * 60 * 1000),
      invalid: { savedAt: now, name: 'repo' },
    })

    expect(Object.keys(normalized)).toEqual(['fresh'])
  })

  test('does not restore terminal detail tabs from cache', () => {
    const now = Date.now()
    const raw = cachedRepo(now) as any
    raw.ui.detailTab = 'terminal'

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.detailTab).toBe('terminal')
  })

  test('restores the changes detail tab from cache', () => {
    const now = Date.now()
    const raw = cachedRepo(now) as any
    raw.ui.detailTab = 'changes'

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.detailTab).toBe('changes')
  })

  test('normalizes cached branch worktree references while dropping dynamic metadata', () => {
    const now = Date.now()
    const raw = cachedRepo(now)
    raw.data.branches = [createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })]

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.data.branches[0]?.worktree).toEqual({ path: '/tmp/worktree-a' })
    expect(normalized.repo?.data.branches[0]?.pullRequest).toBeUndefined()
  })

  test('normalizes missing and invalid worktree path order to an empty array', () => {
    const now = Date.now()
    const missing = cachedRepo(now) as any
    delete missing.ui.worktreePathOrder
    const invalid = cachedRepo(now) as any
    invalid.ui.worktreePathOrder = [123, '/tmp/worktree-a']

    const normalized = normalizeRestorableRepoCache({ missing, invalid })

    expect(normalized.missing?.ui.worktreePathOrder).toEqual([])
    expect(normalized.invalid).toBeUndefined()
  })

  test('normalizes cached project file tree pane sizes', () => {
    const now = Date.now()
    const raw = cachedRepo(now) as any
    raw.ui.fileTreePaneSizes = { 'top-bottom': 44.44, 'left-right': 'bad' }

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': DEFAULT_FILE_TREE_PANE_SIZES['left-right'],
    })
  })

  test('keeps old cached repos without project file tree pane sizes valid', () => {
    const now = Date.now()
    const raw = cachedRepo(now)

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.fileTreePaneSizes).toBeUndefined()
  })

  test('migrates legacy per-repo explorerTab into explorerTabByBranch fallback slot', () => {
    const now = Date.now()
    const missing = cachedRepo(now)
    const invalid = cachedRepo(now) as any
    invalid.ui.explorerTab = 'not-a-tab'
    const valid = cachedRepo(now)
    ;(valid.ui as any).explorerTab = 'local'
    const legacyTags = cachedRepo(now)
    ;(legacyTags.ui as any).explorerTab = 'tags'

    const normalized = normalizeRestorableRepoCache({ missing, invalid, valid, legacyTags })

    expect(normalized.missing?.ui.explorerTabByBranch).toBeUndefined()
    expect(normalized.invalid?.ui.explorerTabByBranch).toBeUndefined()
    expect(normalized.valid?.ui.explorerTabByBranch).toEqual({ '': 'local' })
    expect(normalized.legacyTags?.ui.explorerTabByBranch).toEqual({ '': 'local' })
  })

  test('preserves per-branch explorer tabs and drops invalid entries', () => {
    const now = Date.now()
    const raw = cachedRepo(now) as any
    raw.ui.explorerTabByBranch = {
      main: 'history',
      'feature/a': 'changes',
      bogus: 'not-a-tab',
      literal: 'files',
    }

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.explorerTabByBranch).toEqual({
      main: 'history',
      'feature/a': 'changes',
      literal: 'files',
    })
  })

  test('prefers explorerTabByBranch over legacy explorerTab when both are present', () => {
    const now = Date.now()
    const raw = cachedRepo(now) as any
    raw.ui.explorerTab = 'status'
    raw.ui.explorerTabByBranch = { '': 'local' }

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.explorerTabByBranch).toEqual({ '': 'local' })
  })

  test('preserves quickActions field through normalization', () => {
    const now = Date.now()
    const raw = {
      savedAt: now,
      name: 'repo',
      data: { branches: [], currentBranch: 'main' },
      ui: {
        selectedBranch: null,
        detailTab: 'status',
        worktreePathOrder: [],
        quickActions: { main: 'editor' },
      },
    }

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.quickActions).toEqual({ main: 'editor' })
  })

  test('accepts snapshot without quickActions field', () => {
    const now = Date.now()
    const raw = {
      savedAt: now,
      name: 'repo',
      data: { branches: [], currentBranch: 'main' },
      ui: {
        selectedBranch: null,
        detailTab: 'status',
        worktreePathOrder: [],
      },
    }

    const normalized = normalizeRestorableRepoCache({ repo: raw })

    expect(normalized.repo?.ui.quickActions).toBeUndefined()
  })
})

describe('persistRestorableRepoSnapshot', () => {
  test('does not write a stale cache entry after the repo instance changes', () => {
    const staleRepo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    seedRepoState({ id: '/repo', instanceToken: 2 })

    persistRestorableRepoSnapshot(useReposStore.setState, staleRepo, 1)

    expect(useReposStore.getState().restorableRepoCache['/repo']).toBeUndefined()
  })

  test('persists branch references without dynamic worktree or pull request state', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branchSnapshots: [
        createBranchSnapshot('feature/a', {
          worktree: {
            path: '/tmp/worktree-a',
            isPrimary: true,
            isLocked: true,
            summary: {
              dirty: true,
              changeCount: 2,
            },
          },
          pullRequest: {
            number: 1,
            title: 'PR 1',
            url: 'https://github.com/acme/repo/pull/1',
            state: 'open',
            mergeable: 'MERGEABLE',
          },
        }),
      ],
      currentBranch: 'feature/a',
      selectedBranch: 'feature/a',
    })

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    const cached = useReposStore.getState().restorableRepoCache['/repo']
    expect(cached?.data.branches[0]?.worktree).toEqual({ path: '/tmp/worktree-a' })
    expect(cached?.data.branches[0]?.pullRequest).toBeUndefined()
  })

  test('persists worktree path order in repo cache', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main', { worktree: { path: '/repo' } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      worktreePathOrder: ['/repo'],
    })

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    expect(useReposStore.getState().restorableRepoCache['/repo']?.ui.worktreePathOrder).toEqual(['/repo'])
  })

  test('persists project file tree pane sizes in repo cache', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
      fileTreePaneSizes: { 'top-bottom': 42.2, 'left-right': 73.4 },
    })

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    expect(useReposStore.getState().restorableRepoCache['/repo']?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 42.2,
      'left-right': 73.4,
    })
  })

  test('persists the project explorer tab per branch', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
      explorerTab: 'history',
    })

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    expect(useReposStore.getState().restorableRepoCache['/repo']?.ui.explorerTabByBranch).toEqual({ main: 'history' })
  })

  test('persists UI for an empty Git repo only after its snapshot has loaded', () => {
    const loadedRepo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [],
      currentBranch: '',
      explorerTab: 'changes',
    })
    loadedRepo.resources.snapshot.loadedAt = Date.now()

    persistRestorableRepoSnapshot(useReposStore.setState, loadedRepo, 1)

    expect(useReposStore.getState().restorableRepoCache['/repo']?.data.branches).toEqual([])
    expect(useReposStore.getState().restorableRepoCache['/repo']?.ui.explorerTabByBranch).toEqual({ '': 'changes' })

    resetReposStore()
    const unloadedRepo = seedRepoState({
      id: '/unloaded',
      instanceToken: 2,
      branches: [],
      currentBranch: '',
      explorerTab: 'history',
    })

    persistRestorableRepoSnapshot(useReposStore.setState, unloadedRepo, 2)

    expect(useReposStore.getState().restorableRepoCache['/unloaded']).toBeUndefined()
  })

  test('serializes quickActions from rememberedQuickActions map', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main'), createRepoBranch('feature/auth')],
      currentBranch: 'main',
    })
    rememberedQuickActions.set('/repo\0main', 'editor')
    rememberedQuickActions.set('/repo\0feature/auth', 'terminal')

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    const saved = useReposStore.getState().restorableRepoCache['/repo']
    expect(saved?.ui.quickActions).toEqual({ main: 'editor', 'feature/auth': 'terminal' })
  })

  test('omits quickActions from snapshot when map has no entries for repo', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
    })

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    const saved = useReposStore.getState().restorableRepoCache['/repo']
    expect(saved?.ui.quickActions).toBeUndefined()
  })

  test('only serializes quickActions for branches that currently exist', () => {
    const repo = seedRepoState({
      id: '/repo',
      instanceToken: 1,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
    })
    rememberedQuickActions.set('/repo\0main', 'editor')
    rememberedQuickActions.set('/repo\0deleted-branch', 'terminal')

    persistRestorableRepoSnapshot(useReposStore.setState, repo, 1)

    const saved = useReposStore.getState().restorableRepoCache['/repo']
    expect(saved?.ui.quickActions).toEqual({ main: 'editor' })
  })
})

describe('restoreRepoProjectionFromSnapshot', () => {
  test('hydrates branch references without restoring dynamic worktree or pull request state', () => {
    const now = Date.now()
    const cached = cachedRepo(now)
    cached.data.branches = [
      createBranchSnapshot('feature/a', {
        worktree: { path: '/tmp/worktree-a' },
        pullRequest: {
          number: 2,
          title: 'PR 2',
          url: 'https://github.com/acme/repo/pull/2',
          state: 'open',
          mergeable: 'UNKNOWN',
        },
      }),
    ]

    const repo = restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), cached)

    expect(repo.data.branches[0]?.worktree).toEqual({ path: '/tmp/worktree-a' })
    expect(repo.data.branches[0]?.pullRequest).toBeUndefined()
    expect(repo.data.statusLoaded).toBe(false)
    expect(repo.data.status).toEqual([])
  })

  test('restores project file tree pane sizes from cache', () => {
    const now = Date.now()
    const cached = cachedRepo(now)
    cached.ui.fileTreePaneSizes = { 'top-bottom': 41.5, 'left-right': 70.5 }

    const repo = restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), cached)

    expect(repo.ui.fileTreePaneSizes).toEqual({ 'top-bottom': 41.5, 'left-right': 70.5 })
  })

  test('restores per-branch explorer tabs and defaults old snapshots to empty', () => {
    const now = Date.now()
    const saved = cachedRepo(now)
    saved.ui.explorerTabByBranch = { main: 'status', 'feature/a': 'history' }

    const restored = restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), saved)
    const restoredOld = restoreRepoProjectionFromSnapshot(emptyRepo('/old', 'old'), cachedRepo(now))

    expect(restored.ui.explorerTabByBranch).toEqual({ main: 'status', 'feature/a': 'history' })
    expect(restoredOld.ui.explorerTabByBranch).toEqual({})
  })

  test('restores quickActions from snapshot into rememberedQuickActions map', () => {
    const now = Date.now()
    const snapshot: RestorableRepoSnapshot = {
      savedAt: now,
      name: 'repo',
      data: { branches: [], currentBranch: 'main' },
      ui: {
        selectedBranch: null,
        detailTab: 'status',
        worktreePathOrder: [],
        quickActions: { main: 'editor', 'feature/auth': 'terminal' },
      },
    }

    restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), snapshot)

    expect(rememberedQuickActions.get('/repo\0main')).toBe('editor')
    expect(rememberedQuickActions.get('/repo\0feature/auth')).toBe('terminal')
  })

  test('does not throw when snapshot has no quickActions', () => {
    const now = Date.now()
    const snapshot: RestorableRepoSnapshot = {
      savedAt: now,
      name: 'repo',
      data: { branches: [], currentBranch: 'main' },
      ui: {
        selectedBranch: null,
        detailTab: 'status',
        worktreePathOrder: [],
      },
    }

    expect(() => restoreRepoProjectionFromSnapshot(emptyRepo('/repo', 'repo'), snapshot)).not.toThrow()
    expect(rememberedQuickActions.size).toBe(0)
  })
})
