import { useEffect } from 'react'
import { applyDocumentFontSize } from '#/web/font-family.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'

export function GlobalFontSizeProjection() {
  const { appFontSize } = useRuntimeFontSettings()

  useEffect(() => {
    applyDocumentFontSize(document, appFontSize)
  }, [appFontSize])

  return null
}
