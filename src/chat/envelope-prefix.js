/** Hold a possible marker suffix until its spelling is known. */
export function partialEnvelopeStart(value, name) {
  const text = String(value || "");
  const at = Math.max(text.lastIndexOf("<"), text.lastIndexOf("＜"));
  if (at < 0) return -1;
  const tail = text.slice(at).replace(/＜/g, "<").replace(/＞/g, ">").replace(/\s/g, "").toLowerCase();
  const marker = `<${name}>`;
  return tail.length < marker.length && marker.startsWith(tail) ? at : -1;
}
