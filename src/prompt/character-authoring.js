/** Author fields reuse the character card's existing storage contract. */
export function readCharacterPromptFields(character = {}) {
  const card = character?.profileV2 || character || {};
  const profile = character?.profile || {};
  const prompts = card.prompts || {};
  const examples = character.exampleDialogue ?? card.exampleDialogue ?? [];
  return {
    system: String(profile.promptSystem ?? prompts.characterSystemSupplement ?? ""),
    developer: String(profile.promptDeveloper ?? prompts.characterDeveloperSupplement ?? ""),
    scene: String(character.scenario ?? profile.scenario ?? card.scenario ?? ""),
    exampleDialogue: Array.isArray(examples) ? examples.join("\n\n") : String(examples || ""),
    postHistory: String(character.postHistoryInstructions ?? profile.postHistoryInstructions ?? prompts.postHistoryInstructions ?? ""),
    greeting: String(character.greetings?.primary ?? profile.firstMessage ?? card.greetings?.primary ?? ""),
  };
}

export function characterPromptPatch(character = {}, fields = {}) {
  const values = { ...readCharacterPromptFields(character), ...fields };
  return {
    id: character.id,
    scenario: String(values.scene || ""),
    exampleDialogue: String(values.exampleDialogue || "").trim() ? [String(values.exampleDialogue)] : [],
    postHistoryInstructions: String(values.postHistory || ""),
    greetings: { ...(character.greetings || {}), primary: String(values.greeting || "") },
    profile: {
      ...(character.profile || {}),
      promptSystem: String(values.system || ""),
      promptDeveloper: String(values.developer || ""),
      scenario: String(values.scene || ""),
      firstMessage: String(values.greeting || ""),
      postHistoryInstructions: String(values.postHistory || ""),
    },
  };
}

export function buildCharacterAuthoringBlocks(character, lang = {}) {
  const fields = readCharacterPromptFields(character);
  const en = String(lang.conversationLanguage || lang).startsWith("en");
  const replace = (text) => String(text || "").replace(/\{\{char\}\}/gi, character?.name || "Companion");
  return {
    // These are authorial setup/style, never transcript or retrieved lived memory.
    scenario: fields.scene.trim() ? `${en ? "[Authored scenario · fictional setup, not a record of past events]" : "【作者场景设定 · 虚构背景，不是已发生事件记录】"}\n${replace(fields.scene)}` : "",
    examples: fields.exampleDialogue.trim() ? `${en ? "[Dialogue examples · style reference only, never real conversation history]" : "【示例对话 · 仅作风格参考，不是真实聊天历史】"}\n${replace(fields.exampleDialogue)}` : "",
    postHistory: replace(fields.postHistory).trim(),
  };
}
