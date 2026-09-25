import {
  getPet,
  listDefaultPets,
  readSelectedPetId,
  writeSelectedPetId,
} from "../avatar/pet-catalog.js";
import { t } from "../i18n/index.js";
import { mountLivePetPreview, unmountLivePetPreview } from "./pet-live-preview.js";

const VIEWS = new Set(["home", "library", "desktop", "pack"]);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function petCopy(pet) {
  const id = String(pet?.id || "");
  const label = t(`pages.petLibrary.pets.${id}.label`);
  const tagline = t(`pages.petLibrary.pets.${id}.tagline`);
  return {
    label: label.startsWith("pages.") ? pet.label : label,
    tagline: tagline.startsWith("pages.") ? pet.tagline : tagline,
  };
}

/**
 * Hierarchical pet hub: home → library / desktop / pack.
 * Live sprite/bubble previews carousel in the hero and every library card.
 */
export function wirePetLibrary(root = document) {
  const hub = root.querySelector("[data-pet-hub]") || root.querySelector("[data-companion-section=\"character\"]");
  const libraryHost = root.querySelector("[data-pet-library]");
  if (!hub && !libraryHost) return { refresh() {} };

  const grid = libraryHost?.querySelector("[data-pet-library-grid]") || libraryHost;
  const status = libraryHost?.querySelector("[data-pet-library-status]");
  const preview = hub?.querySelector("[data-pet-hub-preview]")
    || root.querySelector("[data-phone-pet-preview]")
    || root.querySelector("[data-pet-hub-preview]");
  const nameNode = hub?.querySelector("[data-pet-hub-name]") || root.querySelector("[data-phone-pet-name]");
  const taglineNode = hub?.querySelector("[data-pet-hub-tagline]") || root.querySelector("[data-phone-pet-tagline]");
  const views = hub ? Array.from(hub.querySelectorAll("[data-pet-view]")) : [];

  function setView(viewId) {
    if (!hub || !views.length) return;
    const next = VIEWS.has(viewId) ? viewId : "home";
    hub.dataset.petViewActive = next;
    views.forEach((view) => {
      const active = view.getAttribute("data-pet-view") === next;
      view.classList.toggle("is-active", active);
      view.toggleAttribute("hidden", !active);
      view.setAttribute("aria-hidden", active ? "false" : "true");
    });
    if (next === "library") paintLibrary();
    else unmountLibraryCards();
    paintHero();
  }

  function paintHero() {
    const pet = getPet(readSelectedPetId());
    const copy = petCopy(pet);
    if (preview) mountLivePetPreview(preview, pet.id, { offsetMs: 180 });
    if (nameNode) nameNode.textContent = copy.label;
    if (taglineNode) taglineNode.textContent = copy.tagline;
  }

  function unmountLibraryCards() {
    // Only hosts holding a live pet: unmounting empties the node, which would
    // otherwise erase the import tile's glyph for good.
    grid?.querySelectorAll(".pet-library-card__preview[data-pet-preview]")
      .forEach((host) => unmountLivePetPreview(host));
  }

  function paintLibrarySelection(selected) {
    grid?.querySelectorAll("[data-pet-library-pick]").forEach((button) => {
      const active = button.dataset.petLibraryPick === selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      const badge = button.querySelector(".pet-library-card__badge");
      if (badge) badge.textContent = active ? t("pages.petLibrary.inUse") : t("pages.petLibrary.use");
    });
  }

  /** Idempotent: mountLivePetPreview skips hosts that already hold their pet. */
  function mountLibraryPreviews(pets) {
    pets.forEach((pet, index) => {
      const host = grid.querySelector(`[data-pet-library-pick="${pet.id}"] .pet-library-card__preview`);
      mountLivePetPreview(host, pet.id, { offsetMs: 320 + index * 700 });
    });
  }

  function paintLibrary() {
    if (!grid) return;
    const selected = readSelectedPetId();
    const pets = listDefaultPets();
    const existing = [...grid.querySelectorAll("[data-pet-library-pick]")];
    const same = existing.length === pets.length
      && pets.every((pet, index) => existing[index]?.dataset.petLibraryPick === pet.id);
    if (same) {
      paintLibrarySelection(selected);
      // Leaving the view unmounts every preview, so returning to identical
      // markup still needs the sprites put back.
      mountLibraryPreviews(pets);
    } else {
      unmountLibraryCards();
      grid.innerHTML = pets
        .map((pet) => {
          const active = pet.id === selected;
          const copy = petCopy(pet);
          return `
          <button
            type="button"
            class="pet-library-card${active ? " is-selected" : ""}"
            data-pet-library-pick="${escapeHtml(pet.id)}"
            aria-pressed="${active ? "true" : "false"}"
          >
            <span class="pet-library-card__preview pet-live-preview"></span>
            <span class="pet-library-card__copy">
              <strong>${escapeHtml(copy.label)}</strong>
              <small>${escapeHtml(copy.tagline)}</small>
            </span>
            <span class="pet-library-card__badge">${active ? escapeHtml(t("pages.petLibrary.inUse")) : escapeHtml(t("pages.petLibrary.use"))}</span>
          </button>
        `;
        })
        .join("");
      grid.insertAdjacentHTML("beforeend", `
      <button type="button" class="pet-library-card pet-library-card--custom" data-pet-open-view="pack">
        <span class="pet-library-card__preview pet-library-card__custom-mark" aria-hidden="true">＋</span>
        <span class="pet-library-card__copy">
          <strong>${escapeHtml(t("pages.petLibrary.customLabel"))}</strong>
          <small>${escapeHtml(t("pages.petLibrary.customTagline"))}</small>
        </span>
        <span class="pet-library-card__badge">${escapeHtml(t("pages.petLibrary.import"))}</span>
      </button>
    `);
      mountLibraryPreviews(pets);
    }

    const current = pets.find((pet) => pet.id === selected);
    if (status) {
      status.textContent = current
        ? t("pages.petLibrary.status", { name: petCopy(current).label })
        : "";
    }
  }

  function paint() {
    paintHero();
    if (!hub || hub.dataset.petViewActive === "library" || !views.length) paintLibrary();
  }

  hub?.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-pet-open-view]");
    if (!opener || !hub.contains(opener)) return;
    const view = opener.getAttribute("data-pet-open-view");
    if (!view) return;
    event.preventDefault();
    setView(view);
  });

  grid?.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-pet-open-view]");
    if (opener && grid.contains(opener)) {
      event.preventDefault();
      setView(opener.getAttribute("data-pet-open-view") || "pack");
      return;
    }
    const button = event.target.closest("[data-pet-library-pick]");
    if (!button || !grid.contains(button)) return;
    const petId = button.getAttribute("data-pet-library-pick");
    if (!petId) return;
    writeSelectedPetId(petId);
    paint();
  });

  document.addEventListener("yueqi:pet-changed", paint);
  document.addEventListener("yueqi:locale-changed", paint);

  setView(hub?.dataset.petViewActive || "home");
  paint();

  return {
    refresh: paint,
    openView: setView,
  };
}
