import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import * as v from 'valibot'
import writeFileAtomic from 'write-file-atomic'
import type { GeneratedOpenApiKey, OpenApiKeyStatus } from '#/shared/open-api-keys.ts'

const DigestSchema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const KeyFileSchema = v.strictObject({
  key: v.optional(DigestSchema),
  conversation: v.optional(DigestSchema),
  control: v.optional(DigestSchema),
})
type KeyFile = v.InferOutput<typeof KeyFileSchema>

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createOpenApiKeySource(options: {
  file: string
  internalSecret: string
  conversationToken?: string
  controlToken?: string
}) {
  const { file } = options
  let saved: KeyFile | undefined
  let writes = Promise.resolve()
  const startup: KeyFile = {
    conversation:
      options.conversationToken && options.conversationToken !== options.internalSecret
        ? digest(options.conversationToken)
        : undefined,
    control:
      options.controlToken &&
      options.controlToken !== options.internalSecret &&
      options.controlToken !== options.conversationToken
        ? digest(options.controlToken)
        : undefined,
  }

  function read(): KeyFile {
    if (saved) return saved
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as unknown
      const parsed = v.safeParse(KeyFileSchema, data)
      if (!parsed.success) throw new Error('Invalid OpenAPI key file')
      return (saved = parsed.output)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return (saved = {})
    }
  }

  function unifiedKey(): string | undefined {
    const keys = read()
    return keys.key ?? keys.control ?? startup.control
  }

  function legacyConversationKey(): string | undefined {
    return read().conversation ?? startup.conversation
  }

  function status(): OpenApiKeyStatus {
    if (unifiedKey()) return { status: 'configured' }
    return { status: legacyConversationKey() ? 'legacy' : 'unset' }
  }

  return {
    status,
    authorize(token: string | undefined, requireTerminalControl: boolean): 'disabled' | 'unauthorized' | 'authorized' {
      // Existing conversation-only credentials never gain terminal input privileges.
      const expected = unifiedKey() ?? (requireTerminalControl ? undefined : legacyConversationKey())
      if (!expected) return 'disabled'
      return token && timingSafeEqual(Buffer.from(expected, 'hex'), createHash('sha256').update(token).digest())
        ? 'authorized'
        : 'unauthorized'
    },
    generate(replace: boolean): Promise<GeneratedOpenApiKey | null> {
      const operation = writes.then(async () => {
        if (status().status !== 'unset' && !replace) return null
        const key = randomBytes(32).toString('hex')
        const next = { key: digest(key) }
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
        await writeFileAtomic(file, JSON.stringify(next), { mode: 0o600 })
        saved = next
        return { key, status: 'configured' as const }
      })
      writes = operation.then(
        () => undefined,
        () => undefined,
      )
      return operation
    },
  }
}

export type OpenApiKeyStore = ReturnType<typeof createOpenApiKeySource>
