export const DEFAULT_CHUNK_SIZE = 900;
export const DEFAULT_CHUNK_OVERLAP = 100;

/** Split long verbatim text into searchable drawer chunks (paragraph-aware). */
export function splitDrawerText(
  text,
  { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}
) {
  const input = String(text || "").trim();
  if (!input) return [];
  if (input.length <= chunkSize) return [input];

  const chunks = [];
  let start = 0;

  while (start < input.length) {
    let end = Math.min(start + chunkSize, input.length);
    if (end < input.length) {
      const slice = input.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf("。"),
        slice.lastIndexOf("！"),
        slice.lastIndexOf("？"),
        slice.lastIndexOf(". ")
      );
      if (breakAt > chunkSize * 0.4) {
        end = start + breakAt + 1;
      }
    }

    const piece = input.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= input.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function shouldChunkText(text, chunkSize = DEFAULT_CHUNK_SIZE) {
  return String(text || "").trim().length > chunkSize;
}
