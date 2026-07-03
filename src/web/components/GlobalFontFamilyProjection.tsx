import { useEffect } from 'react'
import { applyDocumentFontFamily } from '#/web/font-family.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'

export function GlobalFontFamilyProjection() {
  const { fontFamily } = useRuntimeFontSettings()

  useEffect(() => {
    applyDocumentFontFamily(document, fontFamily)
  }, [fontFamily])

  return null
}
