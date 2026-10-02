import { decideCompanionFloatPanelLayout } from "./companion-float-placement.js";

function assert(name, pass, detail = "") {
  if (!pass) throw new Error(detail ? `${name}: ${detail}` : name);
}

const phone = { viewportWidth: 390, viewportHeight: 844, panelWidth: 280, panelHeight: 148 };

{
  const layout = decideCompanionFloatPanelLayout({
    ...phone,
    petLeft: 16,
    petTop: 72,
    petRight: 148,
    petBottom: 256,
  });
  assert("pet at top opens below", layout.opensDown === true);
  assert("pet at top stays attached (small local X)", Math.abs(layout.localLeft) < 80, String(layout.localLeft));
}

{
  const layout = decideCompanionFloatPanelLayout({
    ...phone,
    petLeft: 250,
    petTop: 620,
    petRight: 374,
    petBottom: 780,
  });
  assert("pet near dock opens above", layout.opensDown === false);
}

{
  const layout = decideCompanionFloatPanelLayout({
    ...phone,
    petLeft: 8,
    petTop: 400,
    petRight: 140,
    petBottom: 560,
    panelHeight: 140,
  });
  assert("enough room above prefers above", layout.opensDown === false);
}

{
  const layout = decideCompanionFloatPanelLayout({
    ...phone,
    petLeft: 300,
    petTop: 72,
    petRight: 382,
    petBottom: 256,
  });
  assert("right-edge pet keeps panel on screen", layout.localLeft + 300 < 390 - 8, String(layout.localLeft));
}

console.log("companion-float-placement: 4/4");
