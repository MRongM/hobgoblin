import QRCode from 'qrcode'

export async function qrCodeDataUrl(value: string, width = 180): Promise<string> {
  try {
    return await QRCode.toDataURL(value, { width, margin: 2 })
  } catch {
    const svg = await QRCode.toString(value, { type: 'svg', width, margin: 2 })
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
}

export async function qrCodeDataUrls(values: readonly string[], width = 180): Promise<Record<string, string>> {
  const qrCodes: Record<string, string> = {}
  for (const value of values) {
    try {
      qrCodes[value] = await qrCodeDataUrl(value, width)
    } catch {
      // Keep rendering the other LAN addresses even if one QR code fails.
    }
  }
  return qrCodes
}
