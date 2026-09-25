import { Capacitor } from "@capacitor/core";

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function getPlatform() {
  return Capacitor.getPlatform();
}

export function isPluginAvailable(name) {
  return Capacitor.isPluginAvailable(name);
}
