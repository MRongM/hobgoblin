import { describe, expect, test, vi, beforeEach } from 'vitest'
import { useEffectiveWorkspaceLayout } from './effective-workspace-layout.ts'
import * as ResponsiveUiMode from '#/web/hooks/useResponsiveUiMode.tsx'

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useResponsiveUiMode: vi.fn(),
}))

describe('useEffectiveWorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns left-right in default mode', () => {
    vi.mocked(ResponsiveUiMode.useResponsiveUiMode).mockReturnValue('default')
    const result = useEffectiveWorkspaceLayout()
    expect(result).toBe('left-right')
  })

  test('returns top-bottom in compact mode', () => {
    vi.mocked(ResponsiveUiMode.useResponsiveUiMode).mockReturnValue('compact')
    const result = useEffectiveWorkspaceLayout()
    expect(result).toBe('top-bottom')
  })
})
