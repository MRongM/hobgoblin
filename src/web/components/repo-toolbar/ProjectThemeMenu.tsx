import { Palette } from 'lucide-react'
import { COLOR_THEMES, type ColorTheme } from '#/shared/color-theme.ts'
import { repoSettingsEntryColorTheme } from '#/shared/repo-settings.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { runSettingsControllerAction, setProjectColorThemePreference } from '#/web/settings-write-paths.ts'
import { useT } from '#/web/stores/i18n.ts'

interface ProjectThemeMenuProps {
  repoId: string
  projectColorTheme: ColorTheme | null
}

const FOLLOW_GLOBAL_VALUE = 'global'

export function ProjectThemeMenu({ repoId, projectColorTheme }: ProjectThemeMenuProps) {
  const t = useT()
  const label = t('project-theme.menu')
  const value = projectColorTheme ?? FOLLOW_GLOBAL_VALUE

  function handleValueChange(nextValue: string) {
    const nextColorTheme = nextValue === FOLLOW_GLOBAL_VALUE ? null : (nextValue as ColorTheme)
    void runSettingsControllerAction('project theme update', async () => {
      await setProjectColorThemePreference(repoId, nextColorTheme)
    })
  }

  return (
    <DropdownMenu>
      <Tip label={label}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" className="shrink-0" aria-label={label}>
            <Palette />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side="bottom" align="end" className="w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={handleValueChange}>
          <DropdownMenuRadioItem value={FOLLOW_GLOBAL_VALUE}>
            {t('project-theme.follow-global')}
          </DropdownMenuRadioItem>
          {COLOR_THEMES.map((colorTheme) => (
            <DropdownMenuRadioItem key={colorTheme} value={colorTheme}>
              {t(`settings.theme-preset.${colorTheme}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProjectThemeMenuConnected({ repoId }: { repoId: string }) {
  const { data } = useSettingsSnapshotQuery()
  const projectColorTheme = repoSettingsEntryColorTheme(data?.repoSettings ?? [], repoId) ?? null
  return <ProjectThemeMenu repoId={repoId} projectColorTheme={projectColorTheme} />
}
