/**
 * Reference-counted body scroll lock shared by every overlay (modals, lightboxes, drawers).
 * Restoring a "previous" value per overlay breaks when two overlays are open at once (e.g. a detail dialog plus its
 * confirm dialog): they close in the wrong order and leave `overflow: hidden` on the body. Counting avoids that.
 */
let locks = 0;

export function lockScroll() {
  if (locks++ === 0) document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks <= 0) releaseAllScrollLocks();
  };
}

/** Safety net: forces the page scrollable again (used after route changes when no dialog is open). */
export function releaseAllScrollLocks() {
  locks = 0;
  document.body.style.overflow = '';
  document.body.style.pointerEvents = '';
}
