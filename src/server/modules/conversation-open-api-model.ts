import * as v from 'valibot'
import { TERMINAL_AGENT_PROVIDERS, TerminalSessionIdSchema } from '#/shared/terminal.ts'

export const CONVERSATION_DELETE_MODES = ['stop-background', 'remove-desktop-copy'] as const
export type ConversationDeleteMode = (typeof CONVERSATION_DELETE_MODES)[number]

export const CONVERSATION_PROVIDERS = TERMINAL_AGENT_PROVIDERS
export const CONVERSATION_STATUSES = ['ready', 'working'] as const
export const CONVERSATION_MESSAGE_ROLES = ['user', 'assistant'] as const
export const CONVERSATION_TITLE_MAX_LENGTH = 256
export const CONVERSATION_REQUEST_MAX_BYTES = 8 * 1024 * 1024
export const TERMINAL_CONTROL_INPUT_MAX_LENGTH = 64 * 1024

const ProviderSchema = v.picklist(CONVERSATION_PROVIDERS)
const StatusSchema = v.picklist(CONVERSATION_STATUSES)
const TitleSchema = v.pipe(v.string(), v.regex(new RegExp(`^[\\s\\S]{0,${CONVERSATION_TITLE_MAX_LENGTH}}$`, 'u')))
const conversationFields = {
  title: v.optional(v.nullable(TitleSchema)),
  terminalSessionId: v.optional(v.nullable(TerminalSessionIdSchema)),
  status: v.optional(StatusSchema),
}
const messageFields = {
  role: v.picklist(CONVERSATION_MESSAGE_ROLES),
  content: v.pipe(v.string(), v.minLength(1)),
}

export const ConversationFiltersSchema = v.strictObject({
  provider: v.optional(ProviderSchema),
  terminalSessionId: v.optional(TerminalSessionIdSchema),
  status: v.optional(StatusSchema),
})
export const CreateConversationSchema = v.strictObject({ provider: ProviderSchema, ...conversationFields })
export const UpdateConversationSchema = v.pipe(
  v.strictObject(conversationFields),
  v.check((input) => Object.keys(input).length > 0),
)
export const CreateMessageSchema = v.strictObject(messageFields)
export const UpdateMessageSchema = v.pipe(
  v.partial(CreateMessageSchema),
  v.check((input) => Object.keys(input).length > 0),
)
export const TerminalControlInputSchema = v.strictObject({
  data: v.pipe(v.string(), v.nonEmpty(), v.maxLength(TERMINAL_CONTROL_INPUT_MAX_LENGTH)),
})
export const AcquireTerminalControlSchema = v.strictObject({ terminalSessionId: TerminalSessionIdSchema })
export const TerminalControlIdSchema = v.pipe(v.string(), v.uuid())
export const WorkspaceTerminalInputSchema = v.strictObject({
  ...TerminalControlInputSchema.entries,
  requestId: TerminalControlIdSchema,
})

export type ConversationFilters = v.InferOutput<typeof ConversationFiltersSchema>
export type CreateConversation = v.InferOutput<typeof CreateConversationSchema>
export type UpdateConversation = v.InferOutput<typeof UpdateConversationSchema>
export type CreateMessage = v.InferOutput<typeof CreateMessageSchema>
export type UpdateMessage = v.InferOutput<typeof UpdateMessageSchema>

export interface ConversationSummary {
  id: string
  provider: CreateConversation['provider']
  title: string | null
  terminalSessionId: string | null
  status: (typeof CONVERSATION_STATUSES)[number]
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage extends CreateMessage {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Conversation extends ConversationSummary {
  messages: ConversationMessage[]
}
