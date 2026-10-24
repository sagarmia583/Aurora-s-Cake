import { useEffect, useRef } from 'react';

let scrollLockCount = 0;
let originalBodyOverflow = '';

function lockBodyScroll() {
  if (scrollLockCount === 0) originalBodyOverflow = document.body.style.overflow;
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount -= 1;
    if (scrollLockCount === 0) document.body.style.overflow = originalBodyOverflow;
  };
}

/** Keyboard and focus behavior shared by the customer dialogs. */
export function useCakeDialog(onClose: () => void, contentKey?: unknown) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockBodyScroll = lockBodyScroll();
    const boundary = () => dialog.querySelector<HTMLElement>('[data-cake-subdialog]') || dialog;
    const focusable = () => Array.from(boundary().querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => {
      (boundary().querySelector<HTMLElement>('[data-dialog-initial-focus]') || focusable()[0] || boundary()).focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-cake-dialog]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          boundary().focus();
        } else if (event.shiftKey && (document.activeElement === first || !boundary().contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !boundary().contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [contentKey]);

  return dialogRef;
}
