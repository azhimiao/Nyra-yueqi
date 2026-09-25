import {
  checkPermission,
  ensurePermission,
  openAppPermissionSettings,
  permissionStatusLabel,
} from "../platform/permissions.js";
import { t } from "../i18n/index.js";
import { refreshIcons } from "../lib/icons.js";
import { capabilityPermissionBroker } from "../platform/native-capabilities.js";
import {
  CAPABILITY_ROW_STATE_KEY,
  capabilityRowKind,
  resolveCapabilityRow,
} from "./capability-row.js";

const UI_CAPABILITY_MAP = Object.freeze({
  microphone: "microphone.capture",
  camera: "camera.capture",
  "location.current": "location.current",
  "notification.send": "notification.send",
  "calendar.read": "calendar.read",
  "calendar.write": "calendar.write",
  "desktop.overlay": "desktop.overlay",
  "screen.capture": "screen.capture",
});

function updateBadge(node, status, detail) {
  const id = node.dataset.permissionBadge;
  if (id === "screen.capture") {
    node.textContent = t("appShell.permissions.perUse");
  } else if (id === "location.current" && status === "granted") {
    node.textContent = t(detail?.accuracy === "precise" ? "appShell.permissions.preciseLocation" : "appShell.permissions.approximateLocation");
  } else if (id === "desktop.overlay" && status === "granted") {
    node.textContent = t(detail?.serviceRunning ? "appShell.permissions.running" : "appShell.permissions.allowed");
  } else {
    node.textContent = permissionStatusLabel(status);
  }
  node.dataset.status = status;
  node.classList.toggle("is-granted", status === "granted");
  node.classList.toggle("is-denied", status === "denied");
}

function hintFor(id, kind) {
  if (kind === "picker") return t("mePanels.permissions.pickerHint");
  if (kind === "session") return t("mePanels.permissions.sessionHint");
  return "";
}

function showRowHint(row, text) {
  const id = row.dataset.permissionAction;
  const hint = row.parentElement?.querySelector(`[data-permission-hint="${id}"]`);
  if (!hint) return;
  hint.textContent = text;
  hint.hidden = !text;
}

function updateActionRow(row, status, detail) {
  const id = row.dataset.permissionAction;
  const kind = capabilityRowKind(id);
  const view = resolveCapabilityRow(kind, status, detail);
  row.dataset.permissionStatus = status;
  row.dataset.permissionState = view.state;
  row.dataset.permissionRowAction = view.action;
  row.classList.toggle("is-granted", view.state === "on");
  row.classList.toggle("is-restricted", view.state === "restricted");
  row.disabled = view.action === "none";
  row.setAttribute("aria-disabled", row.disabled ? "true" : "false");

  const label = row.querySelector(`[data-permission-state="${id}"]`);
  if (label) {
    label.textContent = t(CAPABILITY_ROW_STATE_KEY[view.state]);
    label.dataset.status = view.state;
    label.classList.toggle("is-granted", view.state === "on");
    label.classList.toggle("is-denied", view.state === "restricted");
  }
}

function updateRequestButton(button, status) {
  if (button.dataset.requestPermission === "screen.capture") {
    button.textContent = t("appShell.permissions.askEachUse");
    button.disabled = true;
    button.dataset.permissionStatus = "session";
    return;
  }
  button.disabled = status === "unsupported";
  button.dataset.permissionStatus = status;
  if (status === "granted") {
    button.textContent = t("mePanels.granted");
    button.disabled = true;
    return;
  }
  if (status === "denied") {
    button.textContent = t("mePanels.openSettings");
    return;
  }
  button.textContent = status === "prompt" ? t("mePanels.grant") : t("mePanels.openPermission");
}

function setPermissionFeedback(root, id, message = "", { openSettings = false } = {}) {
  const bars = root.querySelectorAll(`[data-permission-bar="${id}"]`);
  bars.forEach((bar) => {
    let tip = bar.querySelector("[data-permission-guide]");
    if (!tip) {
      tip = document.createElement("p");
      tip.className = "permission-bar-guide";
      tip.setAttribute("data-permission-guide", id);
      bar.append(tip);
    }
    const text = String(message || "").trim();
    tip.hidden = !text;
    tip.textContent = text;
    tip.dataset.openSettings = openSettings ? "1" : "0";
  });
}

function guideFor(id, status) {
  if (status === "granted") return "";
  if (status === "denied") {
    return PERMISSION_GUIDE_DENIED[id] || t("mePanels.permissions.genericDeniedGuide");
  }
  return PERMISSION_GUIDE_PROMPT[id] || t("mePanels.permissions.genericPromptGuide");
}

const PERMISSION_GUIDE_PROMPT = {
  get microphone() { return t("mePanels.permissions.microphoneGuide"); },
  get camera() { return t("mePanels.permissions.cameraGuide"); },
  get storage() { return t("mePanels.permissions.storageGuide"); },
  get location() { return t("mePanels.permissions.locationGuide"); },
  get notification() { return t("mePanels.permissions.notificationGuide"); },
};

const PERMISSION_GUIDE_DENIED = {
  get microphone() { return t("mePanels.permissions.microphoneDenied"); },
  get camera() { return t("mePanels.permissions.cameraDenied"); },
  get storage() { return t("mePanels.permissions.storageDenied"); },
  get location() { return t("mePanels.permissions.locationDenied"); },
  get notification() { return t("mePanels.permissions.notificationDenied"); },
};

export async function refreshPermissionUi(root = document) {
  const ids = new Set();
  root.querySelectorAll("[data-permission-badge]").forEach((node) => {
    const id = node.dataset.permissionBadge;
    if (id) ids.add(id);
  });
  root.querySelectorAll("[data-permission-bar]").forEach((bar) => {
    const id = bar.dataset.permissionBar;
    if (id) ids.add(id);
  });
  root.querySelectorAll("[data-request-permission]").forEach((button) => {
    const id = button.dataset.requestPermission;
    if (id) ids.add(id);
  });
  root.querySelectorAll("[data-permission-action]").forEach((row) => {
    const id = row.dataset.permissionAction;
    // Picker rows resolve without touching any permission API on purpose.
    if (id && capabilityRowKind(id) !== "picker") ids.add(id);
  });

  const statuses = {};
  const details = {};
  await Promise.all(
    [...ids].map(async (id) => {
      statuses[id] = await checkPermission(id);
      const capability = UI_CAPABILITY_MAP[id];
      if (capability) {
        details[id] = await capabilityPermissionBroker.getCapabilityStatus(capability);
      }
    }),
  );

  root.querySelectorAll("[data-permission-badge]").forEach((node) => {
    const id = node.dataset.permissionBadge;
    updateBadge(node, statuses[id] ?? "prompt", details[id]);
  });

  root.querySelectorAll("[data-permission-bar]").forEach((bar) => {
    const id = bar.dataset.permissionBar;
    const status = statuses[id] ?? "granted";
    bar.hidden = status === "granted" || status === "unsupported";
    if (!bar.hidden) {
      setPermissionFeedback(root, id, guideFor(id, status), { openSettings: status === "denied" });
    }
  });

  root.querySelectorAll("[data-request-permission]").forEach((button) => {
    updateRequestButton(button, statuses[button.dataset.requestPermission] ?? "prompt");
  });
  root.querySelectorAll("[data-permission-action]").forEach((row) => {
    const id = row.dataset.permissionAction;
    updateActionRow(row, statuses[id] ?? "prompt", details[id]);
  });
}

export async function ensureImportPermission(permissionId = "storage", handlers = {}) {
  const result = await ensurePermission(permissionId, handlers);
  await refreshPermissionUi();
  if (!result.ok) {
    setPermissionFeedback(document, permissionId, result.message || guideFor(permissionId, result.status), {
      openSettings: Boolean(result.openSettings || result.status === "denied"),
    });
    if (result.openSettings || result.status === "denied") {
      await openAppPermissionSettings();
    } else if (result.message) {
      window.alert(result.message);
    }
  }
  return result.ok;
}

export function wirePermissionUi(options = {}) {
  const { buildRequestHandlers } = options;

  document.querySelectorAll("[data-request-permission]").forEach((button) => {
    if (button.dataset.permissionWired === "1") return;
    button.dataset.permissionWired = "1";
    button.addEventListener("click", async () => {
      const id = button.dataset.requestPermission;
      if (!id) return;
      const priorStatus = button.dataset.permissionStatus || "";
      button.disabled = true;
      try {
        // Explicit "go to settings" path after a prior denial.
        if (priorStatus === "denied") {
          const opened = await openAppPermissionSettings();
          setPermissionFeedback(
            document,
            id,
            opened.ok
              ? t("mePanels.permissions.settingsOpenedGuide")
              : (opened.message || t("mePanels.permissions.settingsOpenFailed")),
            { openSettings: true },
          );
          await refreshPermissionUi();
          return;
        }

        const handlers = buildRequestHandlers?.(id) || {};
        const result = await ensurePermission(id, handlers);
        await refreshPermissionUi();

        if (result.ok) {
          setPermissionFeedback(document, id, t("mePanels.permissions.grantedGuide"), { openSettings: false });
          return;
        }

        setPermissionFeedback(
          document,
          id,
          result.message || guideFor(id, result.status || "denied"),
          { openSettings: Boolean(result.openSettings || result.status === "denied") },
        );

        if (result.openSettings || result.status === "denied") {
          await openAppPermissionSettings();
        } else if (result.message && typeof window !== "undefined") {
          // Fallback when there is no permission bar on this surface.
          const hasBar = document.querySelector(`[data-permission-bar="${id}"]`);
          if (!hasBar) window.alert(result.message);
        }
      } finally {
        const status = await checkPermission(id);
        updateRequestButton(button, status);
      }
    });
  });

  document.querySelectorAll("[data-permission-action]").forEach((row) => {
    if (row.dataset.permissionWired === "1") return;
    row.dataset.permissionWired = "1";
    row.addEventListener("click", async () => {
      const id = row.dataset.permissionAction;
      if (!id || row.disabled) return;
      const action = row.dataset.permissionRowAction || "request";
      if (action === "picker" || action === "session") {
        const kind = capabilityRowKind(id);
        showRowHint(row, hintFor(id, kind));
        return;
      }
      row.disabled = true;
      try {
        if (action === "settings") {
          const capability = UI_CAPABILITY_MAP[id];
          const opened = capability
            ? await capabilityPermissionBroker.openSystemPermissionSettings(capability)
            : await openAppPermissionSettings();
          if (opened?.opened === false || opened?.ok === false) {
            window.alert(opened?.message || t("mePanels.permissions.settingsOpenFailed"));
          }
        } else {
          const handlers = buildRequestHandlers?.(id) || {};
          const result = await ensurePermission(id, handlers);
          if (!result.ok && result.message) {
            window.alert(result.message);
          }
        }
      } finally {
        await refreshPermissionUi();
      }
    });
  });

  if (document.documentElement.dataset.permissionRefreshWired !== "1") {
    document.documentElement.dataset.permissionRefreshWired = "1";
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPermissionUi();
    });
    window.addEventListener("focus", () => refreshPermissionUi());
  }

  refreshPermissionUi().then(() => refreshIcons());
}
