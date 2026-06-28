import { useSyncExternalStore } from 'react';

/**
 * Dev flag for the in-progress toolbar rebuild. Flip it from the console:
 *   localStorage['patrick:new-toolbar'] = '1'   // mount the new toolbar
 *   localStorage['patrick:new-toolbar'] = '0'   // back to the legacy toolbar
 * then either reload or call `setNewToolbar(...)`.
 *
 * TEMPORARY: removed when the new toolbar becomes the default (rebuild phase P5),
 * at which point the legacy toolbar is deleted.
 */
const KEY = 'patrick:new-toolbar';
const CHANGE_EVENT = 'patrick:new-toolbar-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
}

export function useNewToolbarFlag() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function setNewToolbar(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0');
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
