/** Provider reasoning in content is never a character-facing monologue. */
export function isolatePrivateReasoning(input, { streaming = false } = {}) {
  const raw = String(input || "");
  const marker = /<\s*(\/?)\s*(think|thinking)\s*>/gi;
  let depth = 0, start = 0, text = "", found = false, match;
  while ((match = marker.exec(raw))) {
    found = true;
    if (!depth) text += raw.slice(start, match.index);
    if (match[1]) depth = Math.max(0, depth - 1);
    else depth++;
    start = marker.lastIndex;
  }
  if (!depth) text += raw.slice(start);
  const partial = /<\s*\/?\s*(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?\s*$/i;
  const tail = partial.exec(text);
  if (tail && (streaming || /thi/i.test(tail[0]))) text = text.slice(0, tail.index);
  return { text, found, complete: depth === 0 && !(tail && /thi/i.test(tail[0])) };
}
