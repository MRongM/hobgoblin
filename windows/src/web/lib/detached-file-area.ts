export function isFileAreaTabDropOutsideViewport(
  point: { clientX: number; clientY: number },
  viewport: { width: number; height: number },
): boolean {
  return point.clientX < 0 || point.clientY < 0 || point.clientX > viewport.width || point.clientY > viewport.height
}
