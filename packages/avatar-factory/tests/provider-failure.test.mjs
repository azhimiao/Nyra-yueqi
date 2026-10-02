/**
 * CP-AV4: missing ARK key → PROVIDER_NOT_CONFIGURED (no fake images).
 */
import assert from "node:assert/strict";
import { RealProvider } from "../src/providers/real-provider.mjs";
import { PROVIDER_NOT_CONFIGURED } from "../src/providers/types.mjs";

const savedKey = process.env.ARK_API_KEY;
const savedModel = process.env.ARK_IMAGE_MODEL;

try {
  delete process.env.ARK_API_KEY;
  delete process.env.ARK_IMAGE_MODEL;
  process.env.ARK_API_KEY = "";
  process.env.ARK_IMAGE_MODEL = "";

  const provider = new RealProvider({ skipEnvFile: true });

  let err;
  try {
    await provider.ensureConfigured();
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected ensureConfigured to throw");
  assert.equal(err.code, PROVIDER_NOT_CONFIGURED);

  let err2;
  try {
    await provider.generateIdentity({
      spec: {
        characterId: "test",
        displayName: "Test",
        visual: {
          artStyle: "x",
          bodyProportion: "semi_chibi_adult",
          hair: "x",
          eyes: "x",
          face: "x",
          outfit: "x",
          accessories: [],
          palette: [],
        },
      },
      outDir: "F:/beautiful/.avatar-factory/_should_not_write",
      count: 1,
    });
  } catch (e) {
    err2 = e;
  }
  assert.ok(err2, "expected generateIdentity to throw");
  assert.equal(err2.code, PROVIDER_NOT_CONFIGURED);

  console.log(JSON.stringify({ ok: true, suite: "provider-failure", code: PROVIDER_NOT_CONFIGURED }));
} finally {
  if (savedKey !== undefined) process.env.ARK_API_KEY = savedKey;
  else delete process.env.ARK_API_KEY;
  if (savedModel !== undefined) process.env.ARK_IMAGE_MODEL = savedModel;
  else delete process.env.ARK_IMAGE_MODEL;
}
