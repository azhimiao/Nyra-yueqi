import { applyAvatarState, getAvatarState } from "../avatar/character-page.js";
import { t } from "../i18n/index.js";

const MIN_FLOAT_SIZE = 48;
const MAX_FLOAT_SIZE = 96;
const DEFAULT_FLOAT_SIZE = 64;

export function normalizePetFloatSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return DEFAULT_FLOAT_SIZE;
  return Math.round(Math.min(MAX_FLOAT_SIZE, Math.max(MIN_FLOAT_SIZE, size)) / 4) * 4;
}

function sizeLabel(size) {
  if (size <= 56) return t("pages.companionChrome.petSizeSmall");
  if (size >= 80) return t("pages.companionChrome.petSizeLarge");
  return t("pages.companionChrome.petSizeStandard");
}

export function wirePetSizeControl(root = document) {
  const input = root.querySelector("[data-pet-float-size]");
  const output = root.querySelector("[data-pet-float-size-value]");
  if (!input) return { refresh: () => {} };

  let frame = 0;

  function paint(value) {
    const size = normalizePetFloatSize(value);
    input.value = String(size);
    if (output) output.textContent = sizeLabel(size);
    return size;
  }

  function commit(value) {
    const size = paint(value);
    const avatar = getAvatarState();
    if (Number(avatar.display?.floatSize) === size) return;
    applyAvatarState({
      ...avatar,
      display: { ...avatar.display, floatSize: size },
    });
  }

  function scheduleCommit(value) {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      commit(value);
    });
  }

  function refresh() {
    paint(getAvatarState().display?.floatSize);
  }

  input.addEventListener("input", () => scheduleCommit(input.value));
  input.addEventListener("change", () => commit(input.value));
  document.addEventListener("yueqi:avatar-look", refresh);
  document.addEventListener("yueqi:locale-changed", refresh);
  refresh();

  return { refresh };
}
