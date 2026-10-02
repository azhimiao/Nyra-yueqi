/**
 * 举报队列（F7 H5）— localStorage 主存；云 sync 可选
 */

export const REPORTS_STORE_KEY = "yueqi.phone.reports.v1";
export const REPORTS_IDB_STORE = "phone_reports";

const REASONS = new Set(["spam", "copyright", "harmful", "other"]);

export const REPORT_REASON_LABELS = Object.freeze({
  spam: "垃圾信息",
  copyright: "侵权",
  harmful: "不当内容",
  other: "其它",
});

function readBag() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(REPORTS_STORE_KEY) || "{}");
    return { reports: Array.isArray(raw?.reports) ? raw.reports : [] };
  } catch {
    return { reports: [] };
  }
}

function writeBag(bag) {
  window.localStorage.setItem(REPORTS_STORE_KEY, JSON.stringify(bag));
}

/**
 * @param {object} input
 */
export function normalizeReport(input = {}) {
  const reason = REASONS.has(input.reason) ? input.reason : "other";
  return {
    id: String(input.id || `report-${Date.now()}`),
    targetType: "extension",
    targetId: String(input.targetId || "").trim(),
    targetName: String(input.targetName || "").slice(0, 64),
    reason,
    detail: String(input.detail || "").slice(0, 1000),
    mediaId: input.mediaId ? String(input.mediaId) : undefined,
    status: input.status === "read" ? "read" : "pending",
    createdAt: input.createdAt || new Date().toISOString(),
    syncState: ["local", "synced", "failed"].includes(input.syncState)
      ? input.syncState
      : "local",
  };
}

export function listReports() {
  return readBag().reports
    .map(normalizeReport)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getReport(id) {
  return listReports().find((item) => item.id === id) || null;
}

/**
 * @param {{
 *   targetId: string,
 *   targetName?: string,
 *   reason: string,
 *   detail?: string,
 *   mediaId?: string,
 *   syncEnabled?: boolean,
 *   syncEndpoint?: string,
 * }} input
 */
export async function submitReport(input = {}) {
  const report = normalizeReport({
    ...input,
    id: `report-${Date.now()}`,
    status: "pending",
    syncState: "local",
  });
  const bag = readBag();
  bag.reports = [report, ...bag.reports];
  writeBag(bag);

  if (input.syncEnabled && input.syncEndpoint) {
    try {
      const res = await fetch(String(input.syncEndpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (res.ok) {
        markSyncState(report.id, "synced");
        return { ...getReport(report.id), syncState: "synced" };
      }
      markSyncState(report.id, "failed");
      return { ...getReport(report.id), syncState: "failed" };
    } catch {
      markSyncState(report.id, "failed");
      return { ...getReport(report.id), syncState: "failed" };
    }
  }

  return report;
}

export function markReportRead(id) {
  const bag = readBag();
  bag.reports = bag.reports.map((item) => (
    item.id === id ? { ...item, status: "read" } : item
  ));
  writeBag(bag);
  return getReport(id);
}

function markSyncState(id, syncState) {
  const bag = readBag();
  bag.reports = bag.reports.map((item) => (
    item.id === id ? { ...item, syncState } : item
  ));
  writeBag(bag);
}

export function exportReportsBag() {
  return { reports: listReports() };
}

export function importReportsBag(payload = {}) {
  const reports = (Array.isArray(payload?.reports) ? payload.reports : [])
    .map(normalizeReport);
  writeBag({ reports });
  return { reports };
}
