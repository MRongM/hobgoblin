import { describe, expect, test } from 'vitest'
import { normalizeWorkspaceRecoveryExecuteInput } from '#/shared/workspace-recovery.ts'

describe('normalizeWorkspaceRecoveryExecuteInput', () => {
  test('normalizes a plan token and optional invalidation source token', () => {
    expect(
      normalizeWorkspaceRecoveryExecuteInput({
        planToken: ' sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef ',
        sourceToken: ' workspace_recovery_1 ',
      }),
    ).toEqual({
      ok: true,
      input: {
        planToken: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sourceToken: 'workspace_recovery_1',
      },
    })
  })

  test.each([
    null,
    {},
    { planToken: 'sha256:short' },
    { planToken: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', sourceToken: 'bad token' },
    { planToken: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', sourceToken: 1 },
  ])('rejects malformed execute input', (value) => {
    expect(normalizeWorkspaceRecoveryExecuteInput(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
