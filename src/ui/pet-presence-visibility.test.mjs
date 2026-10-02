import { shouldHideInAppFloat, isAppShellVisible } from "./pet-presence-visibility.js";

function assert(name, pass) {
  if (!pass) throw new Error(name);
}

assert("off hides the orb", shouldHideInAppFloat({ wantOn: false }) === true);
assert(
  "on + app visible keeps the orb even if overlay claims running",
  shouldHideInAppFloat({ wantOn: true, overlayRunning: true, appVisible: true }) === false,
);
assert(
  "on + overlay + app backgrounded hides the orb",
  shouldHideInAppFloat({ wantOn: true, overlayRunning: true, appVisible: false }) === true,
);
assert(
  "on + no overlay keeps the orb",
  shouldHideInAppFloat({ wantOn: true, overlayRunning: false, appVisible: true }) === false,
);
assert(
  "visible document is in the foreground",
  isAppShellVisible({ visibilityState: "visible" }) === true,
);
assert(
  "hidden document is backgrounded",
  isAppShellVisible({ visibilityState: "hidden" }) === false,
);

console.log("pet-presence-visibility: 6/6");
