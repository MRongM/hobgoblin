import { describe, expect, test } from 'vitest'
import {
  applyBranchPrefix,
  BRANCH_PREFIX_OPTIONS,
  detectBranchPrefix,
  isKnownBranchPrefix,
} from '#/shared/branch-prefixes.ts'

describe('branch-prefixes', () => {
  test('detects known prefix at the beginning of a branch name', () => {
    expect(detectBranchPrefix('feat/20260730')).toBe('feat/')
    expect(detectBranchPrefix('feature/login')).toBe('feature/')
    expect(detectBranchPrefix('bugfix/nrp-1')).toBe('bugfix/')
    expect(detectBranchPrefix('main')).toBeNull()
  })

  test('detects the longer prefix when both feat/ and feature/ could match', () => {
    // feat/ 与 feature/ 都以 feat 开头；detect 必须按显式清单顺序独立匹配。
    expect(detectBranchPrefix('feature/x')).toBe('feature/')
    expect(detectBranchPrefix('feat/x')).toBe('feat/')
  })

  test('replaces an existing known prefix with a new one', () => {
    expect(applyBranchPrefix('feat/20260730', 'bugfix/')).toBe('bugfix/20260730')
    expect(applyBranchPrefix('feature/foo', 'hotfix/')).toBe('hotfix/foo')
  })

  test('adds the selected prefix when no known prefix currently exists', () => {
    expect(applyBranchPrefix('my-branch', 'feat/')).toBe('feat/my-branch')
    expect(applyBranchPrefix('', 'dev/')).toBe('dev/')
  })

  test('removes the current known prefix when the next prefix is null', () => {
    expect(applyBranchPrefix('feat/foo', null)).toBe('foo')
    expect(applyBranchPrefix('bare', null)).toBe('bare')
  })

  test('isKnownBranchPrefix accepts every option and rejects others', () => {
    for (const prefix of BRANCH_PREFIX_OPTIONS) {
      expect(isKnownBranchPrefix(prefix)).toBe(true)
    }
    expect(isKnownBranchPrefix('random/')).toBe(false)
    expect(isKnownBranchPrefix('feat')).toBe(false)
  })
})
