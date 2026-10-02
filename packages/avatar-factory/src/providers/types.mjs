/**
 * Avatar image provider contract (CP-AV4).
 *
 * Implementations must never invent success without a real API response
 * (fixture provider is explicitly synthetic and never publishable).
 *
 * @typedef {object} CharacterSpec
 * @property {string} characterId
 * @property {string} displayName
 * @property {object} visual
 * @property {object} [personalityMotion]
 * @property {object} [provider]
 *
 * @typedef {object} ProviderErrorLike
 * @property {string} code
 * @property {string} message
 *
 * @typedef {object} FacePartResult
 * @property {string} path
 * @property {boolean} [degraded] - true when true inpaint unavailable / best-effort used
 * @property {string} [note]
 *
 * @typedef {object} AvatarImageProvider
 * @property {string} id - "fixture" | "real" | …
 * @property {string} model - model id recorded in provenance
 * @property {string} [promptTemplateVersion]
 *
 * Generate 1..N identity candidates (full-body, VISUAL_PROTOCOL).
 * @property {(args: {
 *   spec: CharacterSpec,
 *   outDir: string,
 *   count?: number
 * }) => Promise<string[]>} generateIdentity
 *
 * Generate canonical sheets from locked identity.
 * @property {(args: {
 *   spec: CharacterSpec,
 *   lockedPath: string,
 *   outDir: string
 * }) => Promise<{
 *   "full-body.png": string,
 *   "bust.png": string,
 *   "face.png": string,
 *   "neutral-reference.png": string
 * }>} generateCanonical
 *
 * Generate one action keyframe (I2I from lock when supported).
 * @property {(args: {
 *   spec: CharacterSpec,
 *   lockedPath: string,
 *   action: string,
 *   frameIndex: number,
 *   outPath: string
 * }) => Promise<string>} generateActionFrame
 *
 * Face layer part. Prefer inpaint; if API lacks inpaint, best-effort I2I/crop
 * and mark degraded (must not fail the whole pack).
 * @property {(args: {
 *   spec: CharacterSpec,
 *   faceRefPath: string,
 *   part: "base" | "eyes" | "brows" | "mouth" | "blush",
 *   variant: string,
 *   outPath: string
 * }) => Promise<FacePartResult>} inpaintFacePart
 */

export class ProviderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {object} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    Object.assign(this, extra);
  }
}

export const PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED";
