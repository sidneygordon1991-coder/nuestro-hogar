import {useEffect, useRef, type RefObject} from 'react';
const activeTraps: HTMLElement[] = [];
/** Keyboard containment for overlays that live outside the shared form backdrop. */
export function useFocusTrap<T extends HTMLElement>(ref: RefObject<T>, active: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'
        )
      ).filter(el => el.getClientRects().length && !el.closest('[inert]'));
    activeTraps.push(panel);
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (activeTraps[activeTraps.length - 1] !== panel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const all = items(),
        first = all[0],
        last = all[all.length - 1];
      if (!all.length) {
        e.preventDefault();
        return;
      }
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      const i = activeTraps.lastIndexOf(panel);
      if (i >= 0) activeTraps.splice(i, 1);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, active]);
}
