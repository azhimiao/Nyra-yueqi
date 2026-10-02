import assert from "node:assert/strict";
import { buildNyraBaseWorld, buildYueqiHabitat } from "./base-world.js";

const habitat = buildYueqiHabitat("zh-CN");
assert.match(habitat, /你生活在月栖/);
assert.match(habitat, /小手机|Pop/);
assert.doesNotMatch(habitat, /Nyra|林星梨|activeCharacterId/);
assert.match(habitat, /角色卡/);
assert.match(habitat, /不是与用户共同经历/);

const habitatEn = buildYueqiHabitat("en");
assert.match(habitatEn, /You live in Yueqi/);
assert.doesNotMatch(habitatEn, /activeCharacterId/);

const facts = buildNyraBaseWorld("zh-CN");
assert.match(facts, /角色身份与桌宠外观/);
assert.match(facts, /selectedPetId/);

console.log("base-world: PASS");
