import { SettingsSurface } from '#/web/components/SettingsSurface.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/web/components/ui/dialog.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { SettingsPage } from '#/shared/settings-pages.ts'
interface SettingsPageScreenProps {
  page: SettingsPage | null
  onClose: () => void
  onPageChange: (page: SettingsPage) => void
}

export function SettingsPageScreen({ page, onClose, onPageChange }: SettingsPageScreenProps) {
  const t = useT()

  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="backdrop-blur-[2px]"
        className="flex h-[min(50rem,calc(100dvh-2rem))] w-[calc(100dvw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[68rem]"
        onPointerDownOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-settings-trigger]')) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader className="flex h-10 shrink-0 justify-center border-b border-topbar-border bg-topbar px-4 pr-11">
          <DialogTitle className="truncate text-topbar-foreground">{t('settings.title')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <SettingsSurface page={page ?? 'general'} onPageChange={onPageChange} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
