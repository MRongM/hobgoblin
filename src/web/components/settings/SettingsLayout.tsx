import type { ReactNode } from 'react'
import { SettingsContentFrame } from '#/web/components/settings/SettingsContentFrame.tsx'
import { SettingsSidebar } from '#/web/components/settings/SettingsSidebar.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { SETTINGS_PAGE_CONFIG, SETTINGS_PAGES } from '#/shared/settings-pages.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'
import {
  AppWindow,
  Bell,
  Globe,
  Info,
  Keyboard,
  Settings2,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
const SETTINGS_PAGE_ICONS = {
  general: Settings2,
  terminal: TerminalSquare,
  shortcuts: Keyboard,
  notifications: Bell,
  ssh: Shield,
  sync: SlidersHorizontal,
  proxy: Globe,
  apps: AppWindow,
  lan: Globe,
  about: Info,
} as const satisfies Record<SettingsPage, LucideIcon>

interface SettingsLayoutProps {
  page: SettingsPage
  topInset?: number
  autoFocusSelected?: boolean
  children: ReactNode
  onPageChange?: (page: SettingsPage) => void
}

export function SettingsLayout({
  page,
  topInset = 0,
  autoFocusSelected = true,
  children,
  onPageChange,
}: SettingsLayoutProps) {
  const t = useT()
  const pages = SETTINGS_PAGES.map((pageKey) => {
    const config = SETTINGS_PAGE_CONFIG[pageKey]
    return {
      page: pageKey,
      label: t(config.labelKey),
      title: t(config.titleKey),
      Icon: SETTINGS_PAGE_ICONS[pageKey],
    }
  })
  return (
    <div className="relative flex h-full min-h-0 bg-app">
      {topInset > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 [-webkit-app-region:drag]"
          style={{ height: topInset }}
        />
      ) : null}
      <SettingsSidebar
        page={page}
        items={pages}
        topInset={topInset}
        autoFocusSelected={autoFocusSelected}
        ariaLabel={t('settings.title')}
        onPageChange={(nextPage) => {
          onPageChange?.(nextPage)
        }}
      />
      <SettingsContentFrame topInset={topInset}>{children}</SettingsContentFrame>
    </div>
  )
}
