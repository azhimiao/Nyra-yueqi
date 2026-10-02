export function pathToFileURL(path) {
  const normalized = String(path).replace(/\\/g, "/");
  return new URL(normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`);
}
export function fileURLToPath(url) {
  const u = typeof url === "string" ? new URL(url) : url;
  return decodeURIComponent(u.pathname);
}
export function URL$1(input, base) {
  return new URL(input, base);
}
export { URL$1 as URL };
export default { pathToFileURL, fileURLToPath, URL: URL$1 };
