import { callModel } from "./client.js";
import { fetchImageGenerate } from "../imagegen/client.js";
import { transcribeAudio } from "../voice/stt.js";
import { synthesizeSpeech } from "../voice/tts.js";

/**
 * Authoritative capability facade for every provider-backed operation.
 * Feature modules may keep their domain adapters, but provider selection,
 * authentication, billing and execution tracing must remain below this layer.
 */
export const ModelRuntime = Object.freeze({
  chat(config, messages, options = {}) {
    return callModel(config, messages, {
      ...options,
      capability: options.capability || "chat",
    });
  },

  vision(config, messages, options = {}) {
    return callModel(config, messages, {
      ...options,
      capability: "vision",
      businessPurpose: options.businessPurpose || "vision.analyze",
    });
  },

  image(body = {}) {
    return fetchImageGenerate({
      ...body,
      businessPurpose: body.businessPurpose || "image.generate",
    });
  },

  stt(blob, config, options = {}) {
    return transcribeAudio(blob, config, {
      ...options,
      businessPurpose: options.businessPurpose || "voice.transcribe",
    });
  },

  tts(text, config, options = {}) {
    return synthesizeSpeech(text, config, {
      ...options,
      businessPurpose: options.businessPurpose || "voice.synthesize",
    });
  },
});

export default ModelRuntime;
