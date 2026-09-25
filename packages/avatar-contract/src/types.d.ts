export type JobState =
  | "created"
  | "identity_generating"
  | "awaiting_identity_lock"
  | "canonical_generating"
  | "actions_generating"
  | "face_pack_generating"
  | "matting"
  | "registering"
  | "quality_checking"
  | "packaging"
  | "ready"
  | "failed"
  | "cancelled";

export interface CharacterSpec {
  schemaVersion: 1;
  characterId: string;
  displayName: string;
  visual: {
    artStyle: string;
    bodyProportion: "semi_chibi_adult";
    hair: string;
    eyes: string;
    face: string;
    outfit: string;
    accessories: string[];
    palette: string[];
  };
  personalityMotion: {
    energy: number;
    shyness: number;
    expressiveness: number;
    blinkRate: number;
    gazeAvoidance: number;
    reactionSpeed: number;
  };
  provider?: {
    imageProvider?: string;
    model?: string;
    seed?: number;
  };
}

export interface AvatarActionDefinition {
  playback: "loop" | "once";
  returnAction?: string;
  frames: string[];
  fps?: number;
}

export interface FacePackDefinition {
  qualityTier: "A" | "B" | "C" | "D";
  anchors: Record<string, { x: number; y: number }>;
  layers: Record<string, string>;
}

export interface PropDefinition {
  atlas: string;
  anchor: { x: number; y: number };
}

export interface HitboxDefinition {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MotionProfile {
  breathAmp: number;
  swayAmp: number;
  blinkRate: number;
  gazeAvoidance: number;
  reactionSpeed: number;
}

export interface AvatarManifest {
  schemaVersion: 1;
  avatarId: string;
  characterId: string;
  identityVersion: number;
  renderer: "sprite_motion_pack";
  qualityTier: "A" | "B" | "C" | "D";
  publishable: boolean;
  canvas: {
    width: number;
    height: number;
    baselineY: number;
    centerX: number;
  };
  actions: Record<string, AvatarActionDefinition>;
  face: FacePackDefinition;
  props: Record<string, PropDefinition>;
  hitboxes: HitboxDefinition[];
  motionProfile: MotionProfile;
  assetsHash: string;
}

export interface EmbodimentState {
  mode: "idle" | "listening" | "thinking" | "speaking" | "sleeping";
  emotion:
    | "neutral"
    | "happy"
    | "concerned"
    | "sad"
    | "annoyed"
    | "embarrassed"
    | "surprised";
  intensity: number;
  gazeX: number;
  gazeY: number;
  mouthOpen: number;
  artifact?: {
    artifactId: string;
    type: "photo" | "diary" | "book" | "gift" | "message";
    previewUrl: string;
    deepLink: string;
  };
}

export interface AvatarRenderer {
  load(manifestUrl: string): Promise<void>;
  setState(state: EmbodimentState): void;
  setCharacter(characterId: string): Promise<void>;
  playAction(actionId: string): Promise<void>;
  showArtifact(input: EmbodimentState["artifact"]): Promise<void>;
  dispose(): void;
}
