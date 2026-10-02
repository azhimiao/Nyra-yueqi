import {
  resolveDeskPetPowerOn,
  shouldDispatchDeskPetSet,
  shouldRestoreOverlay,
} from "./pet-power-control.js";

function assert(name, pass) {
  if (!pass) throw new Error(name);
}

assert("pref on means the switch is on", resolveDeskPetPowerOn(false, true) === true);
assert("painted on means the switch is on", resolveDeskPetPowerOn(true, false) === true);
assert("both off means the switch is off", resolveDeskPetPowerOn(false, false) === false);
assert("opening while pref already on is a no-op", shouldDispatchDeskPetSet(true, true) === false);
assert("closing always dispatches", shouldDispatchDeskPetSet(false, false) === true);
assert("closing while pref still on dispatches", shouldDispatchDeskPetSet(false, true) === true);
assert("opening from off dispatches", shouldDispatchDeskPetSet(true, false) === true);
assert(
  "refresh does not start overlay while closing",
  shouldRestoreOverlay({ wantOn: true, running: false, closing: true }) === false,
);
assert(
  "refresh starts overlay when wanted and idle",
  shouldRestoreOverlay({ wantOn: true, running: false, closing: false }) === true,
);
assert(
  "refresh does not restart a live overlay",
  shouldRestoreOverlay({ wantOn: true, running: true, closing: false }) === false,
);

console.log("pet-power-control: 10/10");
