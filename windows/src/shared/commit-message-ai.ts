export const COMMIT_MESSAGE_PROVIDERS = ['codex', 'claude'] as const

export type CommitMessageProvider = (typeof COMMIT_MESSAGE_PROVIDERS)[number]

export interface CommitMessageProviderAvailability {
  codex: boolean
  claude: boolean
}

export interface CommitMessageGenerationResult {
  ok: boolean
  message: string
}

export function isCommitMessageProvider(value: unknown): value is CommitMessageProvider {
  return value === 'codex' || value === 'claude'
}
