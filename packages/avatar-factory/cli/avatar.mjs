#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAndRun, resumeJob } from "../src/pipeline.mjs";
import { readJson, PACKS_DIR, JOBS_DIR, ensureFactoryDirs, findLatestJob } from "../src/job-store.mjs";
import { validateAvatarManifest } from "../../avatar-contract/src/index.mjs";

function parse(argv) {
  const cmd = argv[2];
  const out = { cmd, flags: {} };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out.flags[k] = v;
    }
  }
  return out;
}

async function cmdCreate(flags) {
  if (!flags.spec) throw new Error("--spec required");
  const spec = await readJson(path.resolve(flags.spec));
  const provider = flags.provider || "fixture";
  const autoLock = flags["auto-lock"] !== "false" && flags["auto-lock"] !== false;
  const result = await createAndRun({
    spec,
    provider,
    autoLock: Boolean(autoLock) || provider === "fixture",
  });
  console.log(JSON.stringify({ ok: true, ...result.job, packPath: result.packPath, waiting: result.waiting }, null, 2));
}

async function cmdResume(flags) {
  if (!flags.job) throw new Error("--job required");
  const retry = flags.retry === true || flags.retry === "true";
  const result = await resumeJob(flags.job, { retry });
  console.log(JSON.stringify({ ok: true, state: result.job.state, packPath: result.packPath, waiting: result.waiting, error: result.error || null }, null, 2));
  if (result.error) process.exitCode = 1;
}

function parseAutoLock(flags, provider) {
  if (flags["auto-lock"] === "false" || flags["auto-lock"] === false) return false;
  if (flags["auto-lock"] === true || flags["auto-lock"] === "true") return true;
  return provider === "fixture";
}

async function cmdBatch(flags) {
  if (!flags.dir) throw new Error("--dir required");
  const dir = path.resolve(flags.dir);
  const provider = flags.provider || "fixture";
  const autoLock = parseAutoLock(flags, provider) || provider === "real";
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const report = [];
  for (const f of files) {
    try {
      const spec = await readJson(path.join(dir, f));
      const r = await createAndRun({
        spec,
        provider,
        autoLock,
      });
      report.push({
        file: f,
        ok: r.job.state === "ready",
        characterId: spec.characterId,
        state: r.job.state,
        packPath: r.packPath,
        error: r.error || r.job?.error || null,
      });
      if (r.job.state !== "ready") process.exitCode = 1;
    } catch (e) {
      report.push({
        file: f,
        ok: false,
        characterId: spec?.characterId || null,
        error: String(e.message || e),
        errorClass: e?.errorClass || null,
        status: e?.status || null,
      });
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ ok: report.every((x) => x.ok), report }, null, 2));
}

const GOLDEN_SPECS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../specs");

async function cmdGoldenResume(flags) {
  const dir = path.resolve(flags.dir || GOLDEN_SPECS_DIR);
  const provider = "real";
  const autoLock = parseAutoLock(flags, provider) || true;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const report = [];
  for (const f of files) {
    const spec = await readJson(path.join(dir, f));
    const latest = await findLatestJob({ characterId: spec.characterId, provider });
    try {
      let r;
      if (latest?.job.state === "ready") {
        r = { job: latest.job, packPath: latest.job.packPath };
      } else if (latest) {
        r = await resumeJob(latest.job.jobId, { retry: true });
      } else {
        r = await createAndRun({ spec, provider, autoLock });
      }
      const packPath = r.packPath || r.job?.packPath;
      const packNorm = String(packPath || "").replace(/\\/g, "/");
      report.push({
        file: f,
        ok: r.job?.state === "ready",
        jobId: r.job?.jobId,
        characterId: spec.characterId,
        state: r.job?.state,
        packPath,
        inProductionRoot: Boolean(packPath && !packNorm.includes("/_fixture/")),
        publishable: r.job?.publishable ?? null,
        error: r.error || r.job?.error || null,
      });
      if (r.job?.state !== "ready") process.exitCode = 1;
    } catch (e) {
      report.push({
        file: f,
        ok: false,
        characterId: spec.characterId,
        error: String(e.message || e),
        errorClass: e?.errorClass || null,
        status: e?.status || null,
      });
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ ok: report.every((x) => x.ok), provider, report }, null, 2));
}

async function cmdVerify(flags) {
  if (!flags.pack) throw new Error("--pack required");
  const pack = path.resolve(flags.pack);
  const manifest = await readJson(path.join(pack, "manifest.json"));
  const v = validateAvatarManifest(manifest);
  const provenance = await readJson(path.join(pack, "provenance.json"));
  const isFixture = provenance?.provider === "fixture";
  const packNorm = pack.replace(/\\/g, "/");
  const checks = {
    manifest: v.ok,
    manifestErrors: v.errors,
    provenance: Boolean(provenance),
    publishableFalseIfFixture: !(isFixture && manifest.publishable),
    fixtureInFixtureDir: !isFixture || packNorm.includes("/_fixture/"),
    realNotInFixtureDir: isFixture || !packNorm.includes("/_fixture/"),
  };
  const ok =
    checks.manifest &&
    checks.provenance &&
    checks.publishableFalseIfFixture &&
    checks.fixtureInFixtureDir &&
    checks.realNotInFixtureDir;
  console.log(JSON.stringify({ ok, checks, characterId: manifest?.characterId, publishable: manifest?.publishable }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function cmdInstall(flags) {
  // packs already written under public/avatar-packs; install validates catalog entry
  await ensureFactoryDirs();
  const catalog = await readJson(path.join(PACKS_DIR, "catalog.json"), { avatars: [] });
  console.log(JSON.stringify({ ok: true, avatars: catalog.avatars?.length || 0, catalog }, null, 2));
}

async function main() {
  const { cmd, flags } = parse(process.argv);
  if (!cmd || cmd === "help") {
    console.log(`Usage:
  node cli/avatar.mjs create --spec <file> [--provider fixture|real] [--auto-lock]
  node cli/avatar.mjs resume --job <jobId> [--retry]
  node cli/avatar.mjs batch --dir <specsDir> [--provider fixture|real] [--auto-lock]
  node cli/avatar.mjs golden-resume [--dir <specsDir>] [--auto-lock]
  node cli/avatar.mjs verify --pack <packDir>
  node cli/avatar.mjs install
  node cli/avatar.mjs preview --job <jobId>`);
    process.exit(cmd ? 0 : 1);
  }
  if (cmd === "create") await cmdCreate(flags);
  else if (cmd === "resume") await cmdResume(flags);
  else if (cmd === "batch") await cmdBatch(flags);
  else if (cmd === "golden-resume") await cmdGoldenResume(flags);
  else if (cmd === "verify") await cmdVerify(flags);
  else if (cmd === "install") await cmdInstall(flags);
  else if (cmd === "preview") {
    console.log(
      JSON.stringify({
        ok: true,
        hint: "npm run avatar:preview",
        jobDir: flags.job ? path.join(JOBS_DIR, flags.job) : null,
        url: "http://127.0.0.1:5199/",
      }),
    );
  } else throw new Error(`unknown cmd ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
