export type TerminalTranscriptInput = { terminalId: string; executionId: string } & (
  | { kind: 'output'; data: string }
  | { kind: 'gap' | 'end' }
)

export interface TerminalTranscriptLine {
  executionId: string
  text: string | null
  truncated: boolean
}

export interface TerminalTranscriptPageInput {
  terminalId: string
  limit: number
  afterSeq?: number
  beforeSeq?: number
}
