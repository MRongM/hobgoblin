import { ArrowLeft } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { SettingsSurface } from '#/web/components/SettingsSurface.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { SETTINGS_PAGE_CONFIG } from '#/shared/settings-pages.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'
interface SettingsPageScreenProps {
  page: SettingsPage
  onBack: () => void
  onPageChange: (page: SettingsPage) => void
}

export function SettingsPageScreen({ page, onBack, onPageChange }: SettingsPageScreenProps) {
  const t = useT()
  const { topbarHeightPx } = useRuntimeChromeSettings()
  const pageTitle = t(SETTINGS_PAGE_CONFIG[page].titleKey)

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="topbar flex shrink-0 items-center gap-2 border-b border-topbar-border bg-topbar text-sm text-topbar-foreground"
        style={{ height: topbarHeightPx }}
      >
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-2" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('settings.back')}
        </Button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-topbar-foreground">
          {pageTitle}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <SettingsSurface page={page} onPageChange={onPageChange} />
      </div>
    </div>
  )
}
