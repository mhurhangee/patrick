/**
 * Platform-aware keyboard-shortcut formatter: on Mac, render Ctrl/Alt/Shift as
 * ⌘/⌥/⇧ for kbd badges (e.g. context-menu shortcut hints).
 */

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Prefer the modern UA-Client-Hints platform ("macOS"); fall back to the
  // deprecated navigator.platform for browsers that don't expose it.
  const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  return /Mac|iPod|iPhone|iPad/.test(uaPlatform ?? navigator.platform);
}

export function formatKeys(keys: string): string {
  if (isMac()) {
    return keys.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
  }
  return keys;
}
