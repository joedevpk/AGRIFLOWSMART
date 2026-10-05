import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibilité d'une boîte de dialogue modale : focus initial, piège du focus (Tab / Maj+Tab),
 * fermeture avec Échap, blocage du défilement de la page, restitution du focus à la fermeture.
 */
export function useModalA11y(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement>, initialFocusRef?: RefObject<HTMLElement>): void {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const list = (): HTMLElement[] => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (initialFocusRef?.current ?? list()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = list();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, containerRef, initialFocusRef]);
}
