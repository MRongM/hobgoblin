import * as v from 'valibot'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { RepoSessionEntrySchema } from '#/shared/remote-repo-schema.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { SettingsPrefs } from '#/shared/settings.ts'

export const LANG_PREF_VALUES = ['auto', 'en', 'zh', 'ko', 'ja'] as const
export const THEME_PREF_VALUES = ['auto', 'light', 'dark'] as const

export interface NativeSettingsProjectionPatch {
  lang?: SettingsPrefs['lang']
  theme?: SettingsPrefs['theme']
  colorTheme?: SettingsPrefs['colorTheme']
  shortcutsDisabled?: SettingsPrefs['shortcutsDisabled']
  topbarHeightPx?: SettingsPrefs['topbarHeightPx']
}

export interface NativeSettingsProjectionState {
  lang: SettingsPrefs['lang']
  theme: SettingsPrefs['theme']
  colorTheme: SettingsPrefs['colorTheme']
  shortcutsDisabled: SettingsPrefs['shortcutsDisabled']
  topbarHeightPx: SettingsPrefs['topbarHeightPx']
}

export interface NativeRecentReposProjection {
  recentRepos: RepoSessionEntry[]
}

export interface NativeShellProjection {
  prefs?: {
    patch: NativeSettingsProjectionPatch
    settings: NativeSettingsProjectionState
  }
  recentRepos?: NativeRecentReposProjection
}

export const NATIVE_SETTINGS_PROJECTION_KEYS = [
  'lang',
  'theme',
  'colorTheme',
  'shortcutsDisabled',
  'topbarHeightPx',
] as const

export const NativeSettingsProjectionPatchSchema = v.object({
  lang: v.optional(v.picklist(LANG_PREF_VALUES)),
  theme: v.optional(v.picklist(THEME_PREF_VALUES)),
  colorTheme: v.optional(v.picklist(COLOR_THEMES)),
  shortcutsDisabled: v.optional(v.boolean()),
  topbarHeightPx: v.optional(v.number()),
})

export const NativeSettingsProjectionStateSchema = v.object({
  lang: v.picklist(LANG_PREF_VALUES),
  theme: v.picklist(THEME_PREF_VALUES),
  colorTheme: v.picklist(COLOR_THEMES),
  shortcutsDisabled: v.boolean(),
  topbarHeightPx: v.number(),
})

export const NativeRecentReposProjectionSchema = v.object({
  recentRepos: v.array(RepoSessionEntrySchema),
})

export const NativeShellProjectionSchema = v.pipe(
  v.object({
    prefs: v.optional(
      v.object({
        patch: NativeSettingsProjectionPatchSchema,
        settings: NativeSettingsProjectionStateSchema,
      }),
    ),
    recentRepos: v.optional(NativeRecentReposProjectionSchema),
  }),
  v.check(
    (input) => input.prefs !== undefined || input.recentRepos !== undefined,
    'Missing native shell projection payload',
  ),
)

export function pickNativeSettingsProjectionPatch(
  settings: Partial<SettingsPrefs>,
): NativeSettingsProjectionPatch | null {
  const patch: NativeSettingsProjectionPatch = {}
  if (settings.lang !== undefined) patch.lang = settings.lang
  if (settings.theme !== undefined) patch.theme = settings.theme
  if (settings.colorTheme !== undefined) patch.colorTheme = settings.colorTheme
  if (settings.shortcutsDisabled !== undefined) patch.shortcutsDisabled = settings.shortcutsDisabled
  if (settings.topbarHeightPx !== undefined) patch.topbarHeightPx = settings.topbarHeightPx
  return NATIVE_SETTINGS_PROJECTION_KEYS.some((key) => patch[key] !== undefined) ? patch : null
}

export function nativeSettingsProjectionStateFromSettings(settings: SettingsPrefs): NativeSettingsProjectionState {
  return {
    lang: settings.lang,
    theme: settings.theme,
    colorTheme: settings.colorTheme,
    shortcutsDisabled: settings.shortcutsDisabled,
    topbarHeightPx: settings.topbarHeightPx,
  }
}
