/**
 * Layout helper for the in-app desk-pet action panel.
 * Keep the panel attached to the pet box (CSS `top`/`bottom: calc(100% + 8px)`).
 * This module only decides side, max-height, and a local X offset.
 */

export function decideCompanionFloatPanelLayout({
  petLeft = 0,
  petTop = 0,
  petRight = 0,
  petBottom = 0,
  panelWidth = 280,
  panelHeight = 140,
  viewportWidth = 390,
  viewportHeight = 844,
  topSafe = 52,
  bottomSafe = 72,
  margin = 12,
  gap = 8,
} = {}) {
  const spaceAbove = petTop - topSafe;
  const spaceBelow = viewportHeight - bottomSafe - petBottom;
  const need = panelHeight + gap;
  const opensDown = spaceAbove < need && spaceBelow >= spaceAbove;
  const rawAvailable = (opensDown ? spaceBelow : spaceAbove) - gap;
  const maxHeight = Math.max(72, Math.min(panelHeight, Math.max(0, rawAvailable)));

  const alignLeft = petLeft;
  const alignRight = petRight - panelWidth;
  const fitsFromLeft = alignLeft + panelWidth <= viewportWidth - margin;
  const opensRight = fitsFromLeft || alignRight < margin;
  const desiredLeft = opensRight ? alignLeft : alignRight;
  const maxLeft = Math.max(margin, viewportWidth - margin - panelWidth);
  const clampedLeft = Math.max(margin, Math.min(desiredLeft, maxLeft));

  return {
    opensDown,
    opensRight,
    maxHeight,
    localLeft: clampedLeft - petLeft,
  };
}
