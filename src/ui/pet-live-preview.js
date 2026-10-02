import { getPet, mountPet } from "../avatar/pet-catalog.js";

/**
 * Mount a live desk-pet (sprite carousel or bubble) into a preview cell.
 * Reuses the existing controller when the pet id has not changed.
 */
export function mountLivePetPreview(host, petId, options = {}) {
  if (!host) return null;
  const pet = getPet(petId);
  const nextId = pet.id;
  if (host.dataset.petPreview === nextId && host._yueqiLivePet) return host._yueqiLivePet;
  host._yueqiLivePet?.destroy?.();
  host.replaceChildren();
  host.classList.add("pet-live-preview");
  host.dataset.petPreview = nextId;
  host.dataset.petKind = pet.kind;
  const mounted = mountPet(nextId, host, {
    size: "100%",
    state: "idle",
    emotion: "warm",
    ariaLabel: options.ariaLabel || `${pet.label}预览`,
    idleCarouselOffsetMs: options.offsetMs || 0,
  });
  host._yueqiLivePet = mounted.controller;
  return mounted.controller;
}

export function unmountLivePetPreview(host) {
  if (!host) return;
  host._yueqiLivePet?.destroy?.();
  delete host._yueqiLivePet;
  delete host.dataset.petPreview;
  delete host.dataset.petKind;
  host.replaceChildren();
}
