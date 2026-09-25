/**
 * PixiJS v8 sprite_motion_pack renderer — no characterId hardcoding.
 */
import { Application, Container, Sprite, Assets, Texture } from "pixi.js";
import {
  validateEmbodimentState,
  modeToDefaultAction,
} from "../../avatar-contract/src/index.mjs";

function resolveUrl(base, rel) {
  if (!rel) return null;
  if (/^https?:|^\//.test(rel)) return rel;
  return new URL(rel, base.endsWith("/") ? base : base + "/").href;
}

export class SpriteMotionRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = null;
    this.root = null;
    this.body = null;
    this.face = null;
    this.prop = null;
    this.manifest = null;
    this.manifestUrl = null;
    this.baseUrl = null;
    this.characterId = null;
    this.state = {
      mode: "idle",
      emotion: "neutral",
      intensity: 0.3,
      gazeX: 0,
      gazeY: 0,
      mouthOpen: 0,
    };
    this.actionId = "idle";
    this.frameIndex = 0;
    this.t0 = performance.now();
    this._tick = null;
    this._textures = new Map();
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      canvas: this.canvas,
      width: this.canvas.width || 512,
      height: this.canvas.height || 512,
      backgroundAlpha: 0,
      antialias: true,
    });
    this.root = new Container();
    this.body = new Sprite();
    this.face = new Container();
    this.eye = new Sprite();
    this.mouth = new Sprite();
    this.prop = new Sprite();
    this.prop.visible = false;
    this.face.addChild(this.eye, this.mouth);
    this.root.addChild(this.body, this.face, this.prop);
    this.app.stage.addChild(this.root);
    this._tick = (now) => {
      this._animate(now);
      this.app.ticker;
    };
    this.app.ticker.add((ticker) => this._animate(performance.now()));
  }

  async _tex(url) {
    if (!url) return Texture.EMPTY;
    if (this._textures.has(url)) return this._textures.get(url);
    const t = await Assets.load(url);
    this._textures.set(url, t);
    return t;
  }

  async load(manifestUrl) {
    if (!this.app) await this.init();
    this.manifestUrl = manifestUrl;
    this.baseUrl = manifestUrl.replace(/manifest\.json$/i, "");
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    this.manifest = await res.json();
    this.characterId = this.manifest.characterId;
    await this.playAction(modeToDefaultAction(this.state.mode));
    await this._updateFace();
  }

  async setCharacter(characterId) {
    // discover via catalog next to packs
    const catalogUrl = new URL("../../catalog.json", this.baseUrl || "/avatar-packs/").href;
    let catalog;
    try {
      catalog = await (await fetch("/avatar-packs/catalog.json")).json();
    } catch {
      catalog = await (await fetch(catalogUrl)).json();
    }
    const entry = (catalog.avatars || []).find((a) => a.characterId === characterId);
    if (!entry) throw new Error(`character not in catalog: ${characterId}`);
    this._textures.clear();
    await this.load(entry.manifestUrl);
  }

  setState(state) {
    const v = validateEmbodimentState(state);
    if (!v.ok) throw new Error(v.errors.join("; "));
    this.state = { ...state };
    const action = modeToDefaultAction(state.mode);
    this.playAction(action);
    this._updateFace();
    if (state.artifact) this.showArtifact(state.artifact);
    else {
      this.prop.visible = false;
    }
  }

  async playAction(actionId) {
    if (!this.manifest?.actions?.[actionId]) return;
    this.actionId = actionId;
    this.frameIndex = 0;
    const frame = this.manifest.actions[actionId].frames[0];
    const url = resolveUrl(this.baseUrl, frame);
    this.body.texture = await this._tex(url);
    this._layout();
  }

  async showArtifact(input) {
    if (!input || !this.manifest) return;
    const key = input.type || "diary";
    const def = this.manifest.props?.[key] || this.manifest.props?.diary;
    if (!def) return;
    this.prop.texture = await this._tex(resolveUrl(this.baseUrl, def.atlas));
    this.prop.visible = true;
    this.prop.eventMode = "static";
    this.prop.cursor = "pointer";
    this.prop.removeAllListeners();
    this.prop.on("pointertap", () => {
      window.dispatchEvent(
        new CustomEvent("avatar-deep-link", { detail: { deepLink: input.deepLink, artifactId: input.artifactId } }),
      );
    });
    await this.playAction("show_artifact");
  }

  async _updateFace() {
    if (!this.manifest?.face?.layers) return;
    const L = this.manifest.face.layers;
    const eyes = this.state.mode === "sleeping" ? L.eyesClosed : L.eyesOpen;
    const mouth =
      this.state.mouthOpen > 0.35 ? L.mouthOpen || L.mouthClosed : L.mouthClosed;
    if (eyes) this.eye.texture = await this._tex(resolveUrl(this.baseUrl, eyes));
    if (mouth) this.mouth.texture = await this._tex(resolveUrl(this.baseUrl, mouth));
    this._layout();
  }

  _layout() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w, h) / (this.manifest?.canvas?.width || 1024);
    this.root.scale.set(scale);
    this.root.x = w / 2;
    this.root.y = h * 0.92;
    this.body.anchor.set(0.5, 1);
    this.face.x = 0;
    this.face.y = -(this.manifest?.canvas?.height || 1024) * 0.42;
    this.eye.anchor.set(0.5);
    this.mouth.anchor.set(0.5);
    this.mouth.y = 40;
    this.prop.anchor.set(0.5);
    this.prop.x = 120;
    this.prop.y = -220;
    this.prop.scale.set(0.35);
  }

  _animate(now) {
    if (!this.manifest) return;
    const mp = this.manifest.motionProfile || {};
    const t = (now - this.t0) / 1000;
    const breath = 1 + Math.sin(t * 2.2) * (mp.breathAmp || 0.01);
    this.body.scale.y = breath;
    this.body.scale.x = 1;
    this.body.x = Math.sin(t * 1.1) * ((mp.swayAmp || 0.004) * 400);
    // mouth from state
    const open = this.state.mouthOpen || 0;
    this.mouth.scale.y = 0.85 + open * 0.4;
    // frame advance for loop actions
    const clip = this.manifest.actions?.[this.actionId];
    if (clip?.playback === "loop" && clip.frames.length > 1) {
      const fps = clip.fps || 8;
      const idx = Math.floor(t * fps) % clip.frames.length;
      if (idx !== this.frameIndex) {
        this.frameIndex = idx;
        const url = resolveUrl(this.baseUrl, clip.frames[idx]);
        this._tex(url).then((tex) => {
          this.body.texture = tex;
        });
      }
    }
  }

  dispose() {
    this.app?.destroy(true);
    this.app = null;
    this._textures.clear();
  }
}
