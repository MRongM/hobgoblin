import { Hono } from 'hono'
import * as v from 'valibot'
import { serverLogger } from '#/server/logger.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import { errorResponse, requireBearer } from '#/server/routes/open-api-http.ts'
import type { TerminalRegistry } from '#/server/terminal/terminal-registry-source.ts'
import type { TerminalTranscript } from '#/server/terminal/terminal-transcript-source.ts'
import { TerminalSessionIdSchema } from '#/shared/terminal.ts'

const positiveInteger = v.pipe(v.string(), v.regex(/^[1-9]\d{0,15}$/), v.transform(Number), v.safeInteger())
const pageQuery = v.object({
  limit: v.optional(v.pipe(positiveInteger, v.maxValue(100))),
  cursor: v.optional(positiveInteger),
  workspaceId: v.optional(v.pipe(v.string(), v.regex(/^[a-f0-9]{24}$/))),
  state: v.optional(v.picklist(['running', 'exited'])),
})
const transcriptQuery = v.object({
  limit: v.optional(v.pipe(positiveInteger, v.maxValue(200))),
  afterSeq: v.optional(v.union([v.literal('0'), positiveInteger])),
  beforeSeq: v.optional(positiveInteger),
})

export function createTerminalRegistryRoutes(
  keys: OpenApiKeyStore,
  registry: Pick<TerminalRegistry, 'has' | 'list'>,
  transcript?: Pick<TerminalTranscript, 'list'>,
) {
  const routes = new Hono()
  routes.get('/terminal-records', requireBearer(keys, true), (c) => {
    const query = v.safeParse(pageQuery, c.req.query())
    if (!query.success) return errorResponse(c, 400, 'invalid_request', 'Invalid terminal record page parameters')
    const { limit = 30, cursor, workspaceId, state } = query.output
    try {
      return c.json(registry.list({ limit, cursor, workspaceId, state }))
    } catch (error) {
      serverLogger.error({ err: error }, 'Unable to read the terminal registry')
      return errorResponse(c, 503, 'terminal_registry_unavailable', 'Terminal registry is unavailable')
    }
  })
  if (transcript) {
    routes.get('/terminal-records/:terminalId/transcript', requireBearer(keys, true), (c) => {
      const id = c.req.param('terminalId')
      const query = v.safeParse(transcriptQuery, c.req.query())
      if (!v.is(TerminalSessionIdSchema, id) || !query.success) {
        return errorResponse(c, 400, 'invalid_request', 'Invalid terminal transcript parameters')
      }
      const { limit = 100, afterSeq, beforeSeq } = query.output
      if (afterSeq !== undefined && beforeSeq !== undefined) {
        return errorResponse(c, 400, 'invalid_request', 'Use one terminal transcript cursor')
      }
      c.header('Cache-Control', 'no-store')
      try {
        if (!registry.has(id)) return errorResponse(c, 404, 'terminal_not_found', 'Terminal record not found')
        return c.json(
          transcript.list({
            terminalId: id,
            limit,
            beforeSeq,
            afterSeq: afterSeq === undefined ? undefined : Number(afterSeq),
          }),
        )
      } catch (error) {
        serverLogger.error({ err: error }, 'Unable to read the terminal transcript')
        return errorResponse(c, 503, 'terminal_transcript_unavailable', 'Terminal transcript is unavailable')
      }
    })
  }
  return routes
}
