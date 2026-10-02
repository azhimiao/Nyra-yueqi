/**
 * Desk-pet power decisions shared by the companion hub switch, chat toggle,
 * and phone pet page. Keep these tiny and side-effect free so a hung overlay
 * start cannot trap the Off click.
 */

export function resolveDeskPetPowerOn(petOn, prefOn) {
  return Boolean(petOn) || Boolean(prefOn);
}

/** Opening again is a no-op. Closing must always reach the shared closer. */
export function shouldDispatchDeskPetSet(enabled, prefOn) {
  if (Boolean(enabled) && Boolean(prefOn)) return false;
  return true;
}

export function shouldRestoreOverlay({ wantOn, running, closing } = {}) {
  return Boolean(wantOn) && !running && !closing;
}
