import { getDeviceCapability, listDeviceCapabilities } from "./device-registry.js";

export const CAPABILITY_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  INTERNAL_DENIED: "INTERNAL_DENIED",
  OS_NOT_REQUESTED: "OS_NOT_REQUESTED",
  OS_GRANTED: "OS_GRANTED",
  OS_DENIED: "OS_DENIED",
  OS_DENIED_PERMANENTLY: "OS_DENIED_PERMANENTLY",
  SPECIAL_PERMISSION_REQUIRED: "SPECIAL_PERMISSION_REQUIRED",
  SESSION_CONSENT_REQUIRED: "SESSION_CONSENT_REQUIRED",
  UNAVAILABLE_ON_DEVICE: "UNAVAILABLE_ON_DEVICE",
  RESTRICTED_IN_BACKGROUND: "RESTRICTED_IN_BACKGROUND",
});

const INTERNAL_GRANTS_KEY = "yueqi.deviceCapabilityGrants.v1";

function readGrantBag() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(INTERNAL_GRANTS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export const localCapabilityGrantStore = {
  isGranted(permission) {
    if (permission === "voice.output" || permission === "calendar.internal") return true;
    return readGrantBag()[permission] === true;
  },
  grant(permission) {
    const bag = readGrantBag();
    bag[permission] = true;
    globalThis.localStorage?.setItem(INTERNAL_GRANTS_KEY, JSON.stringify(bag));
  },
  revoke(permission) {
    const bag = readGrantBag();
    bag[permission] = false;
    globalThis.localStorage?.setItem(INTERNAL_GRANTS_KEY, JSON.stringify(bag));
  },
};

function normalizeNativeState(capability, state = {}) {
  const status = Object.values(CAPABILITY_STATUS).includes(state.status)
    ? state.status
    : (state.granted ? CAPABILITY_STATUS.OS_GRANTED : CAPABILITY_STATUS.OS_NOT_REQUESTED);
  return {
    capability,
    status,
    granted: Boolean(state.granted),
    nativePermission: state.nativePermission || "",
    canAskAgain: state.canAskAgain !== false,
    needsSettings: Boolean(state.needsSettings),
    sessionScoped: Boolean(state.sessionScoped),
    reason: state.reason || status,
    accuracy: state.accuracy || "",
    serviceRunning: Boolean(state.serviceRunning),
    visible: state.visible == null ? undefined : Boolean(state.visible),
    appForeground: state.appForeground == null ? undefined : Boolean(state.appForeground),
  };
}

export function capabilityFailure(capability, state = {}) {
  const definition = getDeviceCapability(capability);
  const status = state.status || CAPABILITY_STATUS.OS_NOT_REQUESTED;
  return {
    ok: false,
    code: status === CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE
      ? "DEVICE_UNSUPPORTED"
      : status === CAPABILITY_STATUS.RESTRICTED_IN_BACKGROUND
        ? "APP_BACKGROUND_RESTRICTED"
        : status === CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED
          ? "SESSION_REQUIRED"
          : "PERMISSION_REQUIRED",
    capability,
    status,
    canRequestNow: state.canAskAgain !== false && !state.needsSettings,
    needsSettings: Boolean(state.needsSettings),
    sessionScoped: Boolean(state.sessionScoped ?? definition?.sessionScoped),
    reason: state.reason || status,
  };
}

export class CapabilityPermissionBroker {
  constructor({ nativeAdapter, internalStore = localCapabilityGrantStore } = {}) {
    if (!nativeAdapter) throw new Error("capability_native_adapter_required");
    this.nativeAdapter = nativeAdapter;
    this.internalStore = internalStore;
  }

  async getCapabilityStatus(capabilityId) {
    const definition = getDeviceCapability(capabilityId);
    if (!definition) {
      return normalizeNativeState(capabilityId, {
        status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE,
        reason: "UNKNOWN_CAPABILITY",
      });
    }
    if (definition.implemented === false) {
      return {
        ...normalizeNativeState(capabilityId, {
          status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE,
          granted: false,
          canAskAgain: false,
          reason: "CAPABILITY_NOT_IMPLEMENTED",
        }),
        internalGranted: false,
        definition,
      };
    }
    const native = normalizeNativeState(
      definition.id,
      await this.nativeAdapter.getCapabilityStatus(definition.id, definition),
    );
    const appForeground = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (definition.requiresForeground && !appForeground && native.granted) {
      return {
        ...native,
        status: CAPABILITY_STATUS.RESTRICTED_IN_BACKGROUND,
        granted: false,
        appForeground: false,
        internalGranted: this.internalStore.isGranted(definition.internalPermission),
        reason: CAPABILITY_STATUS.RESTRICTED_IN_BACKGROUND,
        definition,
      };
    }
    // Persistent OS capabilities use the operating-system permission as their
    // only enable state. Keeping a second local grant makes a capability look
    // disabled even when Android Settings says it is allowed.
    const internalGranted = definition.systemPermissionOnly
      ? true
      : this.internalStore.isGranted(definition.internalPermission);
    if (native.status === CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE) {
      return {
        ...native,
        internalGranted,
        definition,
      };
    }
    if (!internalGranted) {
      return {
        ...native,
        status: CAPABILITY_STATUS.INTERNAL_DENIED,
        osStatus: native.status,
        granted: false,
        reason: CAPABILITY_STATUS.INTERNAL_DENIED,
        internalGranted: false,
        definition,
      };
    }
    const available = native.status === CAPABILITY_STATUS.OS_GRANTED || native.granted;
    return {
      ...native,
      status: available ? CAPABILITY_STATUS.AVAILABLE : native.status,
      osStatus: native.status,
      granted: available,
      internalGranted: true,
      sessionScoped: definition.sessionScoped || native.sessionScoped,
      definition,
    };
  }

  async requestCapability(capabilityId, options = {}) {
    const definition = getDeviceCapability(capabilityId);
    if (!definition) return this.getCapabilityStatus(capabilityId);
    if (definition.requiresUserGesture && options.userGesture !== true) {
      const state = await this.getCapabilityStatus(capabilityId);
      return { ...state, granted: false, reason: "USER_GESTURE_REQUIRED" };
    }

    if (!definition.systemPermissionOnly) {
      this.internalStore.grant(definition.internalPermission);
    }
    let state = await this.getCapabilityStatus(definition.id);
    if (definition.sessionScoped && state.status === CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED) {
      return state;
    }
    if (state.status === CAPABILITY_STATUS.AVAILABLE) return state;
    if (state.needsSettings || state.status === CAPABILITY_STATUS.OS_DENIED_PERMANENTLY) return state;

    const requested = await this.nativeAdapter.requestCapability(definition.id, definition, options);
    state = normalizeNativeState(definition.id, requested);
    if (!state.granted && state.status !== CAPABILITY_STATUS.OS_GRANTED) {
      return { ...state, internalGranted: true, definition };
    }
    return {
      ...state,
      status: CAPABILITY_STATUS.AVAILABLE,
      osStatus: state.status,
      granted: true,
      internalGranted: true,
      definition,
    };
  }

  async ensureCapability(capabilityId, options = {}) {
    let state = await this.getCapabilityStatus(capabilityId);
    if (state.definition?.executionRequiresUserGesture && options.userGesture !== true) {
      return {
        ok: false,
        code: "USER_GESTURE_REQUIRED",
        capability: capabilityId,
        status: state.status,
        canRequestNow: true,
        needsSettings: false,
        sessionScoped: Boolean(state.sessionScoped),
        reason: "USER_GESTURE_REQUIRED",
      };
    }
    if (state.granted && state.status === CAPABILITY_STATUS.AVAILABLE) {
      return { ok: true, capability: capabilityId, state };
    }
    if (
      state.internalGranted
      && state.status === CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED
      && options.allowSessionConsent === true
      && options.userGesture === true
    ) {
      return {
        ok: true,
        capability: capabilityId,
        sessionConsentRequired: true,
        state,
      };
    }
    if (options.allowRequest === true && options.userGesture === true) {
      state = await this.requestCapability(capabilityId, options);
      if (state.granted && state.status === CAPABILITY_STATUS.AVAILABLE) {
        return { ok: true, capability: capabilityId, state };
      }
      if (
        state.internalGranted
        && state.status === CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED
        && options.allowSessionConsent === true
      ) {
        return {
          ok: true,
          capability: capabilityId,
          sessionConsentRequired: true,
          state,
        };
      }
    }
    return capabilityFailure(capabilityId, state);
  }

  async openSystemPermissionSettings(capabilityId) {
    const definition = getDeviceCapability(capabilityId);
    if (!definition) return { opened: false, reason: "UNKNOWN_CAPABILITY" };
    return this.nativeAdapter.openSystemPermissionSettings(definition.id, definition);
  }

  async revokeInternalCapability(capabilityId) {
    const definition = getDeviceCapability(capabilityId);
    if (!definition) return false;
    if (definition.systemPermissionOnly) return false;
    this.internalStore.revoke(definition.internalPermission);
    await this.nativeAdapter.onInternalCapabilityRevoked?.(definition.id, definition);
    return true;
  }

  async getAllCapabilityStates() {
    const rows = await Promise.all(
      listDeviceCapabilities().map((definition) => this.getCapabilityStatus(definition.id)),
    );
    return Object.fromEntries(rows.map((state) => [state.capability, state]));
  }
}

export function createCapabilityToolPreflight(broker) {
  return async function preflight(capability, options = {}) {
    return broker.ensureCapability(capability, {
      allowRequest: false,
      userGesture: false,
      ...options,
    });
  };
}
