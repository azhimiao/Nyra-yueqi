const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function parseVersion(raw) {
  const value = String(raw || "").trim().replace(/^v/i, "");
  if (!VERSION_RE.test(value)) return null;
  const [core] = value.split("-", 1);
  return {
    value,
    parts: core.split(".").map(Number),
  };
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) {
      return left.parts[index] - right.parts[index];
    }
  }
  return 0;
}

function validDownloadUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function resolveUpdatePolicy(currentRaw, manifest, locale = "zh-CN") {
  const current = parseVersion(currentRaw);
  const latest = parseVersion(manifest?.latestVersion);
  const minimum = parseVersion(manifest?.minimumVersion);
  const downloadUrl = validDownloadUrl(manifest?.downloadUrl);
  if (
    Number(manifest?.schemaVersion) !== 2
    || !current
    || !latest
    || !minimum
    || !downloadUrl
    || compareVersions(minimum, latest) > 0
  ) {
    return { kind: "invalid", reason: "invalid_manifest" };
  }
  if (compareVersions(current, latest) >= 0) {
    return { kind: "none", currentVersion: current.value, latestVersion: latest.value };
  }
  const forcedByMinimum = compareVersions(current, minimum) < 0;
  const forcedByRelease = manifest?.mandatory === true;
  const preferredLocale = locale === "en" ? "en" : "zh-CN";
  const notes = String(
    manifest?.notes?.[preferredLocale]
    || manifest?.notes?.["zh-CN"]
    || manifest?.notes?.en
    || "",
  ).slice(0, 4000);
  return {
    kind: forcedByMinimum || forcedByRelease ? "forced" : "optional",
    reason: forcedByMinimum
      ? "minimum_version"
      : forcedByRelease
        ? "release_mandatory"
        : "newer_version",
    currentVersion: current.value,
    latestVersion: latest.value,
    minimumVersion: minimum.value,
    downloadUrl,
    notes,
    publishedAt: String(manifest?.publishedAt || ""),
    channel: String(manifest?.channel || "stable"),
  };
}
