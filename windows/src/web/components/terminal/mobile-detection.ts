const MOBILE_USER_AGENT_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
const WINDOWS_DESKTOP_USER_AGENT_PATTERN = /Windows NT/i

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const userAgent = navigator.userAgent
  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) return true
  if (WINDOWS_DESKTOP_USER_AGENT_PATTERN.test(userAgent)) return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}
