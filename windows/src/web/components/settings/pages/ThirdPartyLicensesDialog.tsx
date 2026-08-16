import { useState } from 'react'
import thirdPartyNotices from '../../../../../THIRD_PARTY_NOTICES.md?raw'
import mapleMonoLicense from '../../../../../LICENSES/Maple-Mono-OFL-1.1.txt?raw'
import nerdFontsLicense from '../../../../../LICENSES/Nerd-Fonts-LICENSE.txt?raw'
import resourceHanRoundedLicense from '../../../../../LICENSES/Resource-Han-Rounded-LICENSE.md?raw'
import { Button } from '#/web/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { useT } from '#/web/stores/i18n.ts'

const licenseDocuments = [
  { title: 'THIRD_PARTY_NOTICES.md', content: thirdPartyNotices },
  { title: 'Maple Mono', content: mapleMonoLicense },
  { title: 'Nerd Fonts', content: nerdFontsLicense },
  { title: 'Resource Han Rounded', content: resourceHanRoundedLicense },
] as const

export function ThirdPartyLicensesDialog() {
  const t = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        data-interactive
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="shrink-0 text-muted-foreground hover:text-accent-foreground"
      >
        {t('about.third-party-licenses.open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>{t('about.third-party-licenses.dialog-title')}</DialogTitle>
            <DialogDescription>{t('about.third-party-licenses.dialog-description')}</DialogDescription>
          </DialogHeader>
          <div
            data-slot="third-party-license-scroll-region"
            className="min-h-0 space-y-5 overflow-y-auto overscroll-contain pr-2"
          >
            {licenseDocuments.map((document) => (
              <section key={document.title} className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">{document.title}</h3>
                <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {document.content}
                </pre>
              </section>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('dialog.close')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
