/**
 * Bottom sheets that live inside a scrolling page get trapped under the App
 * dock (z-index 42). Park them on document.body while open so primary actions
 * stay tappable.
 */

export function pinSheetToViewport(el) {
  if (!el || el.parentElement === document.body) return;
  el._sheetHomeParent = el.parentElement;
  el._sheetHomeNext = el.nextSibling;
  document.body.append(el);
}

export function restoreSheetFromViewport(el) {
  if (!el?._sheetHomeParent || el.parentElement !== document.body) return;
  el._sheetHomeParent.insertBefore(el, el._sheetHomeNext || null);
}
