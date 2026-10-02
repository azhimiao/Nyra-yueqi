/**
 * Prompt builders enforcing VISUAL_PROTOCOL from avatar-contract.
 */
import { VISUAL_PROTOCOL } from "../../../avatar-contract/src/index.mjs";

const FORBIDDEN_LINE = [
  "no photorealism",
  "no 3D render",
  "no multi-character",
  "no checkerboard background",
  "no transparent background",
  "no alpha checker",
  "no watermark",
  "no text overlay",
  "no logo",
  "no UI chrome",
].join(", ");

export function visualProtocolBlock() {
  return [
    `solid flat background color exactly ${VISUAL_PROTOCOL.background} (#B8B8B8 medium gray), fill entire canvas edge to edge`,
    `body proportion: semi-chibi adult (head-to-body ratio about ${VISUAL_PROTOCOL.headRatio} heads), cute but adult`,
    `view: ${VISUAL_PROTOCOL.view.replace(/_/g, " ")}`,
    "single character only, clear readable silhouette",
    FORBIDDEN_LINE,
  ].join(", ");
}

/**
 * @param {object} spec
 */
export function identityTraits(spec) {
  const v = spec.visual || {};
  const accessories = Array.isArray(v.accessories) ? v.accessories.join(", ") : "";
  const palette = Array.isArray(v.palette) ? v.palette.join(", ") : "";
  return [
    `anime character named "${spec.displayName || spec.characterId}"`,
    `art style: ${v.artStyle || "clean Japanese anime cel shading"}`,
    `hair: ${v.hair || "styled hair"}`,
    `eyes: ${v.eyes || "expressive eyes"}`,
    `face: ${v.face || "soft face"}`,
    `outfit: ${v.outfit || "simple outfit"}`,
    accessories ? `accessories: ${accessories}` : "",
    palette ? `color palette accents: ${palette}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * @param {object} spec
 * @param {number} index
 */
export function promptIdentityCandidate(spec, index) {
  const variants = [
    "subtle soft smile, relaxed shoulders",
    "gentle closed-mouth expression, calm eyes",
    "slight head tilt, friendly look",
    "neutral poised stance, soft gaze",
  ];
  return [
    "Original full-body character design for a desktop companion avatar.",
    identityTraits(spec),
    "FULL BODY standing, feet visible near bottom of frame, centered, head not cropped,",
    variants[(index - 1) % variants.length],
    visualProtocolBlock(),
    "high-quality Japanese anime illustration, clean lineart, soft cel shading.",
  ].join(" ");
}

/**
 * @param {object} spec
 * @param {"full-body"|"bust"|"face"|"neutral-reference"} kind
 */
export function promptCanonical(spec, kind) {
  const base = [
    "Keep the EXACT same character identity, face, hair, outfit, and colors as the reference image.",
    identityTraits(spec),
    visualProtocolBlock(),
  ];
  if (kind === "bust") {
    return [...base, "framing: upper-body bust portrait, chest-up, face clear, same outfit."].join(" ");
  }
  if (kind === "face") {
    return [
      ...base,
      "framing: face close-up portrait, eyes and mouth clearly visible, soft expression, no hands covering face.",
    ].join(" ");
  }
  return [
    ...base,
    "FULL BODY front idle standing pose, feet visible, centered, neutral soft expression, single character.",
  ].join(" ");
}

const ACTION_PROMPTS = {
  idle: [
    "full-body idle standing, relaxed arms at sides, calm soft smile, feet planted",
    "full-body idle standing, slight weight shift, gentle breathing pose, soft gaze",
  ],
  listening: [
    "full-body listening pose, attentive lean forward slightly, hands soft, focused eyes",
    "full-body listening, head tilted a little, patient expression, open posture",
  ],
  thinking: [
    "full-body thinking pose, one hand near chin, thoughtful eyes looking aside",
    "full-body thinking, finger lightly on cheek, contemplative soft frown",
  ],
  speaking: [
    "full-body speaking pose, mouth slightly open mid-speech, one hand gesturing gently",
    "full-body talking, animated but small gesture, warm engaging eyes, mouth open a bit",
  ],
  happy: [
    "full-body happy pose, bright smile, light cheerful energy, hands slightly raised",
    "full-body joyful expression, eyes softly closed smiling, upbeat stance",
  ],
  concerned: [
    "full-body concerned pose, worried brows, careful posture, hands near chest",
    "full-body uneasy caring look, slight lean, hesitant soft expression",
  ],
  sleeping: [
    "full-body sleeping pose, eyes closed peaceful, resting pose, calm",
    "full-body dozing, head slightly down, sleepy closed eyes, relaxed body",
  ],
  tap_react: [
    "full-body startled react after a tap, slight jump, surprised open mouth, blush",
    "full-body playful flinch reaction, hands near chest, wide eyes, cute surprise",
  ],
  show_artifact: [
    "full-body presenting an item pose, both hands offering forward as if showing an object (no readable text on item)",
    "full-body show-and-tell stance, one hand presenting forward, proud soft smile",
  ],
  enter: ["full-body entering greeting, small welcoming wave, friendly smile, full body visible"],
  exit: ["full-body exiting wave goodbye, turning slightly, gentle farewell smile, full body visible"],
};

/**
 * @param {object} spec
 * @param {string} action
 * @param {number} frameIndex 1-based
 */
export function promptActionFrame(spec, action, frameIndex) {
  const list = ACTION_PROMPTS[action] || ACTION_PROMPTS.idle;
  const pose = list[(frameIndex - 1) % list.length];
  return [
    "Edit the reference character into a new pose while keeping identity locked.",
    "Same face, hair, outfit, colors, proportions.",
    identityTraits(spec),
    `Pose: ${pose}.`,
    "FULL BODY, feet visible, centered,",
    visualProtocolBlock(),
  ].join(" ");
}

/**
 * Best-effort face-part prompts (I2I crop style — not true inpaint).
 * @param {object} spec
 * @param {string} part
 * @param {string} variant
 */
export function promptFacePart(spec, part, variant) {
  const common = [
    "Same character identity as reference.",
    identityTraits(spec),
    `solid flat background ${VISUAL_PROTOCOL.background}, no checkerboard, no watermark, no text.`,
    "clean anime illustration, soft cel shading.",
  ];
  if (part === "base") {
    return [...common, "face portrait base layer, neutral expression, eyes open, mouth closed softly."].join(" ");
  }
  if (part === "eyes") {
    const map = {
      open: "close-up of BOTH eyes open looking forward, isolated eyes region, no full body",
      closed: "close-up of BOTH eyes closed (sleep/blink), isolated eyes region",
      half: "close-up of BOTH eyes half-lidded, isolated eyes region",
      happy: "close-up of BOTH happy crescent smiling eyes, isolated eyes region",
    };
    return [...common, map[variant] || map.open].join(" ");
  }
  if (part === "brows") {
    return [
      ...common,
      `close-up eyebrows only for expression "${variant}", isolated brow region on gray background`,
    ].join(" ");
  }
  if (part === "mouth") {
    const map = {
      closed: "close-up mouth closed neutral",
      small: "close-up mouth slightly open small",
      medium: "close-up mouth open medium speaking",
      open: "close-up mouth open wider speaking",
      smile: "close-up smiling closed mouth",
    };
    return [...common, map[variant] || map.closed, ", isolated mouth region, no full face required"].join(" ");
  }
  if (part === "blush") {
    return [...common, "soft cheek blush overlay marks only, subtle pink, isolated on gray background"].join(" ");
  }
  return [...common, `face part ${part} variant ${variant}`].join(" ");
}
