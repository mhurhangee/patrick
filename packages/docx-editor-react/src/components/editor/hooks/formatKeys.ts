/**
 * Platform-aware keyboard-shortcut formatter: on Mac, render Ctrl/Alt/Shift as
 * ⌘/⌥/⇧ for kbd badges (e.g. context-menu shortcut hints).
 */

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function formatKeys(keys: string): string {
  if (isMac()) {
    return keys.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
  }
  return keys;
}
