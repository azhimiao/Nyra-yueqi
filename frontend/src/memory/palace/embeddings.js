import { EMBEDDING_SIZE } from "../../constants.js";
import { hashToken, tokenize } from "../../lib/utils.js";
import { getPalaceSettings } from "../../settings/preferences.js";

function normalizeVector(vector) {
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

/** Legacy hash bag-of-words (web preview fallback). */
export function hashEmbedText(text) {
  const vector = new Array(EMBEDDING_SIZE).fill(0);
  tokenize(text).forEach((token) => {
    vector[hashToken(token) % EMBEDDING_SIZE] += 1;
  });
  return normalizeVector(vector);
}

/** Enhanced local embedding: unigrams + bigrams for better hybrid recall without a model server. */
export function enhancedEmbedText(text) {
  const vector = new Array(EMBEDDING_SIZE).fill(0);
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    vector[hashToken(token) % EMBEDDING_SIZE] += 1;
  });

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]}_${tokens[index + 1]}`;
    vector[hashToken(bigram) % EMBEDDING_SIZE] += 0.65;
  }

  if (tokens.length >= 3) {
    for (let index = 0; index < tokens.length - 2; index += 3) {
      const trigram = `${tokens[index]}_${tokens[index + 1]}_${tokens[index + 2]}`;
      vector[hashToken(trigram) % EMBEDDING_SIZE] += 0.35;
    }
  }

  return normalizeVector(vector);
}

export function embedPalaceText(text) {
  const mode = getPalaceSettings().embeddingMode || "enhanced";
  return mode === "hash" ? hashEmbedText(text) : enhancedEmbedText(text);
}
