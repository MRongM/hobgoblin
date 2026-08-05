import type { DictKey } from '#/shared/i18n/en.ts'
import type { TerminalCustomButton, TerminalCustomButtonAction } from '#/shared/settings.ts'

interface TerminalCustomButtonPresetDefinition {
  id: string
  action: TerminalCustomButtonAction
  fallbackLabel: string
  fallbackValue: string
  labelKey: DictKey
  valueKey: DictKey
}

export const TERMINAL_CUSTOM_BUTTON_PRESETS = [
  {
    id: 'confirm-continue',
    action: 'execute',
    fallbackLabel: 'Confirm, continue',
    fallbackValue: 'Confirm and continue',
    labelKey: 'terminal.custom-button-presets.confirm-continue.label',
    valueKey: 'terminal.custom-button-presets.confirm-continue.value',
  },
  {
    id: 'try-if-needed',
    action: 'execute',
    fallbackLabel: 'Try if needed',
    fallbackValue: 'Try it if needed',
    labelKey: 'terminal.custom-button-presets.try-if-needed.label',
    valueKey: 'terminal.custom-button-presets.try-if-needed.value',
  },
  {
    id: 'show-progress',
    action: 'execute',
    fallbackLabel: 'Progress',
    fallbackValue: 'What is the current progress?',
    labelKey: 'terminal.custom-button-presets.show-progress.label',
    valueKey: 'terminal.custom-button-presets.show-progress.value',
  },
  {
    id: 'autonomous-decisions',
    action: 'execute',
    fallbackLabel: 'Decide autonomously',
    fallbackValue:
      'Confirmed. Make decisions autonomously and execute the plan inline. Defer anything requiring my confirmation until the end.',
    labelKey: 'terminal.custom-button-presets.autonomous-decisions.label',
    valueKey: 'terminal.custom-button-presets.autonomous-decisions.value',
  },
  {
    id: 'commit-and-push',
    action: 'input',
    fallbackLabel: 'Commit, push',
    fallbackValue: 'Generate the commit message, commit the changes, and push them to the remote.',
    labelKey: 'terminal.custom-button-presets.commit-and-push.label',
    valueKey: 'terminal.custom-button-presets.commit-and-push.value',
  },
  {
    id: 'ship-release',
    action: 'input',
    fallbackLabel: 'Merge and release',
    fallbackValue:
      'Merge into main, create a tag, generate an English release description, create a new release, and update Pages.',
    labelKey: 'terminal.custom-button-presets.ship-release.label',
    valueKey: 'terminal.custom-button-presets.ship-release.value',
  },
  {
    id: 'batch-operations',
    action: 'input',
    fallbackLabel: 'Batch operations',
    fallbackValue:
      "1. Pull and update the current repository's source branch. 2. Batch-merge it into the current branch.",
    labelKey: 'terminal.custom-button-presets.batch-operations.label',
    valueKey: 'terminal.custom-button-presets.batch-operations.value',
  },
] as const satisfies readonly TerminalCustomButtonPresetDefinition[]

export type TerminalCustomButtonPresetId = (typeof TERMINAL_CUSTOM_BUTTON_PRESETS)[number]['id']

const presetIds = new Set<string>(TERMINAL_CUSTOM_BUTTON_PRESETS.map((preset) => preset.id))
const presetsById = new Map<TerminalCustomButtonPresetId, (typeof TERMINAL_CUSTOM_BUTTON_PRESETS)[number]>(
  TERMINAL_CUSTOM_BUTTON_PRESETS.map((preset) => [preset.id, preset]),
)

export function isTerminalCustomButtonPresetId(value: unknown): value is TerminalCustomButtonPresetId {
  return typeof value === 'string' && presetIds.has(value)
}

export function createDefaultTerminalCustomButtons(): TerminalCustomButton[] {
  return TERMINAL_CUSTOM_BUTTON_PRESETS.map((preset) => ({
    label: preset.fallbackLabel,
    value: preset.fallbackValue,
    action: preset.action,
    presetId: preset.id,
  }))
}

export function resolveTerminalCustomButtonPreset(
  button: TerminalCustomButton,
  translate: (key: DictKey) => string,
): TerminalCustomButton {
  if (!isTerminalCustomButtonPresetId(button.presetId)) return button
  const preset = presetsById.get(button.presetId)
  if (!preset) return button
  return {
    ...button,
    label: translatedOrFallback(translate, preset.labelKey, preset.fallbackLabel),
    value: translatedOrFallback(translate, preset.valueKey, preset.fallbackValue),
  }
}

function translatedOrFallback(translate: (key: DictKey) => string, key: DictKey, fallback: string): string {
  const translated = translate(key)
  return translated && translated !== key ? translated : fallback
}
