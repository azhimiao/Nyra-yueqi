/** Locale-aware copy for the system assistant. Tool ids remain language-neutral. */

import { getLocale } from "../i18n/index.js";

const COPY = Object.freeze({
  "zh-CN": {
    name: "栖机助手",
    console: "系统操作台",
    intro: "先理解目标，再读取状态、调用能力。每次写入都由你最终确认。",
    welcomeTitle: "下达任务",
    welcomeHint: "检查设置、改角色、加世界书，或直接说你想完成的事。",
    newConversation: "新会话",
    trustLabel: "能力与安全状态",
    domains: "{count} 个领域",
    tools: "{count} 项能力",
    writeConfirmation: "写入操作默认需你确认",
    current: "作用域 · {label}",
    global: "全局",
    directory: "能力域",
    directoryHint: "角色、记忆、日历、界面等",
    commonRequests: "快捷指令",
    placeholder: "描述目标，例如：检查当前角色人设…",
    inputLabel: "对栖机助手下达指令",
    send: "发送",
    sending: "正在处理…",
    voiceInput: "语音输入",
    voiceRecording: "正在录音，点一下结束",
    voiceTranscribing: "正在转写…",
    voiceNeedKey: "请先在接口页配置 STT API Key。",
    voiceFailed: "转写失败：{error}",
    newLineHint: "Shift + Enter 换行",
    footnote: "密钥不会进入助手对话；删除和修改均留下本地审计记录。",
    checking: "正在解析目标并检查可用能力…",
    packTitle: "能力域 · {name}",
    riskRead: "只读",
    riskAction: "打开界面",
    riskWrite: "待确认写入",
    riskDestructive: "待强确认",
    pending: "待确认",
    cancelled: "已取消",
    completed: "已完成",
    incomplete: "未完成",
    cancel: "取消",
    confirmDelete: "确认删除",
    confirmExecute: "确认执行",
    ask: "问助手",
    askPage: "让栖机助手指导当前页面",
    packPrompt: "介绍一下「{label}」能帮我做什么",
    defaultGreeting: "栖机助手已就绪。说明目标后，我会读取状态、调用能力，并在写入前请你确认。",
    processed: "已处理。",
    turnFailed: "这次没有完成，请检查设置后再试。",
    operationFailed: "操作没有完成：{error}",
    unknownError: "未知错误",
    executed: "已执行：{summary}",
    executeFailed: "没有执行成功：{summary}",
    done: "已完成。",
    failed: "执行失败。",
    cancelSummary: "已取消，没有写入任何数据。",
    noKey: "栖机助手需要先连接一个模型。请到主导航「接口」填写服务地址、模型和密钥；密钥只保存在本机，不会出现在助手对话里。",
    emptyModel: "助手没有返回内容，请再试一次。",
    invalidJson: "参数不是有效 JSON",
    resultOmitted: "[结果过长，已省略]",
    gatewayReturn: "本地能力网关返回：\n{notes}\n请根据真实结果继续；若目标已完成，用一两句话收尾。",
    roundLimit: "这次操作已到达安全轮次上限。你可以缩小目标后继续。",
    approvalDelete: "需要你确认后，我才会执行「{label}」。这项操作可能删除数据。",
    approvalWrite: "我已经准备好「{label}」，确认后才会写入。",
    packMissing: "没有找到「{name}」。可用领域：{packs}",
    riskGuideRead: "只读",
    riskGuideAction: "界面动作",
    riskGuideWrite: "确认后写入",
    riskGuideDestructive: "强确认",
    toolReadSuccess: "已完成：{label}。",
    toolActionSuccess: "已完成界面操作：{label}。",
    toolWriteSuccess: "已完成写入：{label}。",
    toolFailure: "未能完成「{label}」。请检查目标对象和当前设置。",
    capabilitiesResult: "当前覆盖 {packs} 个领域、{tools} 项能力；写操作默认先确认。",
    contextResult: "当前上下文：{context}",
    auditResult: "最近有 {count} 条助手操作记录。",
    providerReady: "模型接口已配置；密钥不会显示给助手。",
    providerMissing: "模型接口未完成配置；密钥不会显示给助手。",
    undoNone: "没有可以撤销的助手写入。",
    undoDone: "已撤销最近一次可逆写入。",
    chipCheckSettings: "检查当前设置",
    chipCheckSettingsPrompt: "帮我检查当前页面的设置有没有问题",
    chipCheckCharacter: "检查角色人设",
    chipCheckCharacterPrompt: "帮我看看当前角色人设，还缺哪些关键信息",
    chipAddWorld: "新增世界设定",
    chipAddWorldPrompt: "帮我新增一条世界设定",
    chipCreatePlan: "创建约定",
    chipCreatePlanPrompt: "帮我创建一个新的约定",
    chipRecent: "最近操作",
    chipRecentPrompt: "查看栖机助手最近做过的操作",
  },
  en: {
    name: "Nyra Assistant",
    console: "SYSTEM CONSOLE",
    intro: "Describe the outcome. The assistant will inspect state and use approved capabilities. Every write remains under your control.",
    welcomeTitle: "Issue a task",
    welcomeHint: "Check settings, edit a character, add worldbook entries, or just say what you want done.",
    newConversation: "New session",
    trustLabel: "Capabilities and safety status",
    domains: "{count} domains",
    tools: "{count} capabilities",
    writeConfirmation: "Writes require your approval by default",
    current: "Scope · {label}",
    global: "Global",
    directory: "Capability domains",
    directoryHint: "Characters, memory, calendar, interface, and more",
    commonRequests: "Quick commands",
    placeholder: "Describe the goal, e.g. inspect the active character…",
    inputLabel: "Command for Nyra Assistant",
    send: "Send",
    sending: "Working…",
    voiceInput: "Voice input",
    voiceRecording: "Recording — tap to finish",
    voiceTranscribing: "Transcribing…",
    voiceNeedKey: "Configure an STT API key on the interface page first.",
    voiceFailed: "Transcription failed: {error}",
    newLineHint: "Shift + Enter for a new line",
    footnote: "Secrets never enter assistant chat. Changes and deletions stay in the local audit log.",
    checking: "Parsing the goal and checking available capabilities…",
    packTitle: "Domain · {name}",
    riskRead: "Read only",
    riskAction: "Open interface",
    riskWrite: "Write approval",
    riskDestructive: "Strong approval",
    pending: "Approval required",
    cancelled: "Cancelled",
    completed: "Completed",
    incomplete: "Not completed",
    cancel: "Cancel",
    confirmDelete: "Confirm deletion",
    confirmExecute: "Confirm action",
    ask: "Ask assistant",
    askPage: "Ask Nyra Assistant about this page",
    packPrompt: "What can the {label} area help me do?",
    defaultGreeting: "Nyra Assistant is ready. State a goal — I will inspect state, call capabilities, and ask before any write.",
    processed: "Done.",
    turnFailed: "That was not completed. Check the configuration and try again.",
    operationFailed: "The operation did not complete: {error}",
    unknownError: "Unknown error",
    executed: "Completed: {summary}",
    executeFailed: "Could not complete: {summary}",
    done: "Completed.",
    failed: "Execution failed.",
    cancelSummary: "Cancelled. No data was changed.",
    noKey: "Nyra Assistant needs a model connection first. Open API from the main navigation and provide the endpoint, model, and key. The key stays on this device and never enters assistant chat.",
    emptyModel: "The assistant returned no content. Please try again.",
    invalidJson: "The tool arguments are not valid JSON.",
    resultOmitted: "[Result omitted because it was too long]",
    gatewayReturn: "The local capability gateway returned:\n{notes}\nContinue from the verified result. If the goal is complete, close with one or two concise sentences in English.",
    roundLimit: "This operation reached the safety round limit. Narrow the goal and continue.",
    approvalDelete: "Your approval is required before I run “{label}”. This operation may delete data.",
    approvalWrite: "“{label}” is ready. Nothing will be written until you approve it.",
    packMissing: "“{name}” was not found. Available areas: {packs}",
    riskGuideRead: "read only",
    riskGuideAction: "interface action",
    riskGuideWrite: "write after approval",
    riskGuideDestructive: "strong approval",
    toolReadSuccess: "Finished: {label}.",
    toolActionSuccess: "Interface action completed: {label}.",
    toolWriteSuccess: "Write completed: {label}.",
    toolFailure: "Could not complete “{label}”. Check the selected item and current configuration.",
    capabilitiesResult: "Available now: {packs} domains and {tools} capabilities. Writes require approval by default.",
    contextResult: "Current context: {context}",
    auditResult: "There are {count} recent assistant audit entries.",
    providerReady: "The model connection is configured. Secrets are never shown to the assistant.",
    providerMissing: "The model connection is incomplete. Secrets are never shown to the assistant.",
    undoNone: "There is no reversible assistant write to undo.",
    undoDone: "The latest reversible write was undone.",
    chipCheckSettings: "Check settings",
    chipCheckSettingsPrompt: "Check this page for settings that may be incomplete or inconsistent",
    chipCheckCharacter: "Check character",
    chipCheckCharacterPrompt: "Review the active character profile and identify missing essentials",
    chipAddWorld: "Add world entry",
    chipAddWorldPrompt: "Help me add a new worldbook entry",
    chipCreatePlan: "Create plan",
    chipCreatePlanPrompt: "Help me create a new calendar plan",
    chipRecent: "Recent actions",
    chipRecentPrompt: "Show the assistant's recent operations",
  },
});

export const EN_PACKS = Object.freeze({
  system: ["System guide", "Explain any Nyra feature, capability boundary, and current availability."],
  navigation: ["Navigation", "Take the user to an App page, phone app, or settings detail."],
  character: ["Characters and relationships", "Inspect, create, switch, and edit character profiles and relationship settings."],
  worldbook: ["Worldbook", "Manage world entries injected by keywords or persistent rules."],
  presets: ["Reply presets", "Manage tone, system prefixes, and developer constraints."],
  regex: ["Message filters", "Create, inspect, and maintain message rules using natural language."],
  calendar: ["Calendar and plans", "Review plans, create reminders, and organize upcoming events."],
  memory: ["Long-term memory", "Search, correct, and delete memories with approval for every write."],
  library: ["Listen and read together", "Inspect books, music, shared reading progress, and reading anchors."],
  gallery: ["Gallery", "Organize gallery groups without silently reading or uploading media."],
  proactive: ["Proactive companionship", "Inspect and tune proactive contact, quiet windows, and cadence."],
  appearance: ["Interface and appearance", "Apply product-approved themes and interface modes without arbitrary CSS injection."],
  voice: ["Voice", "Inspect voice capabilities and edit non-secret preferences."],
  scenario: ["Scenes", "Review available scenes and unfinished journeys, then open a continuous story."],
  moments: ["Moments", "Review recent moments and open the feed. Publishing still requires user approval."],
  tasks: ["Task center", "Inspect agent task state, pending approvals, and recent artifacts."],
  privacy: ["Privacy and audit", "Inspect model connection status, audit assistant operations, and undo reversible writes."],
});

export const EN_TOOLS = Object.freeze({
  "system.capabilities": "View capability overview", "system.explain": "Explain a feature or tool", "system.context": "Read current page context",
  "navigation.open_settings": "Open settings detail", "navigation.open_app": "Open a phone app", "navigation.open_panel": "Open an App page",
  "character.list": "List characters", "character.read": "Read character profile", "character.create": "Create character", "character.update": "Update character profile", "character.activate": "Switch active character",
  "worldbook.list": "List worldbook entries", "worldbook.read": "Read worldbook entry", "worldbook.upsert": "Create or update entry", "worldbook.toggle": "Enable or disable entry", "worldbook.delete": "Delete entry",
  "presets.list": "List reply presets", "presets.activate": "Switch reply preset", "presets.duplicate": "Duplicate preset", "presets.update": "Update preset", "presets.delete": "Delete custom preset",
  "regex.list": "List message filters", "regex.upsert": "Create or update filter", "regex.toggle": "Enable or disable filter", "regex.delete": "Delete custom filter",
  "calendar.list": "View upcoming plans", "calendar.create": "Create plan", "calendar.delete": "Delete plan",
  "memory.search": "Search memory", "memory.update": "Correct memory", "memory.delete": "Delete memory",
  "library.status": "View library status", "library.update_book": "Update reading progress",
  "gallery.list_groups": "List gallery groups", "gallery.create_group": "Create gallery group", "gallery.rename_group": "Rename gallery group", "gallery.delete_group": "Delete gallery group",
  "proactive.read": "View proactive settings", "proactive.update": "Update proactive settings",
  "appearance.themes": "List themes", "appearance.apply_theme": "Apply theme", "appearance.interface": "View interface mode", "appearance.switch_mode": "Switch App or phone mode",
  "voice.status": "Check voice status", "voice.update": "Update voice preferences",
  "scenario.list": "List scenes and progress", "scenario.open": "Open scenes",
  "moments.list": "View recent moments", "moments.open": "Open moments",
  "tasks.list": "List tasks",
  "privacy.provider_status": "View model connection status", "privacy.audit": "View operation audit", "privacy.undo": "Undo latest reversible write",
});

const CONTEXTS = Object.freeze({
  en: {
    assist: "Global", identity: "Character settings", behavior: "Daily behavior", theme: "Theme", language: "Language",
    memory: "Long-term memory", cloud: "Data, backup, and model connection", account: "Account", worldbook: "Worldbook",
    presets: "Reply presets", regex: "Message filters", diary: "Diary", external: "Calendar, voice, and permissions",
    interface: "Interface mode", update: "Updates", community: "Community", calendar: "Calendar", gallery: "Gallery",
    scenario: "Scenes", moments: "Moments", tasks: "Task center",
  },
  "zh-CN": {
    assist: "全局", identity: "角色设定", behavior: "日常行为", theme: "主题", language: "语言", memory: "长期记忆",
    cloud: "数据、备份与模型连接", account: "账号", worldbook: "世界书", presets: "回复预设", regex: "消息过滤",
    diary: "日记", external: "日历、语音与系统权限", interface: "界面模式", update: "版本更新", community: "用户社区",
    calendar: "日历", gallery: "相册", scenario: "栖境", moments: "朋友圈", tasks: "任务中心",
  },
});

const GREETINGS = Object.freeze({
  en: {
    regex: "You're on Message Filters. Describe what should be kept, removed, or rewritten. I'll inspect the current rules before proposing a change for approval.",
    presets: "You're on Reply Presets. Describe the tone, pace, and boundaries you want. I'll compare the current presets before proposing a change.",
    identity: "You're on Character Settings. I can review the active profile, complete relationship details, or prepare a new character. Every change requires your approval.",
    worldbook: "You're on Worldbook. Describe the place, person, fact, or rule the character should remember. I'll turn it into a structured entry for approval.",
    memory: "You're on Memory. I can search, verify, or correct stored memories. Changes and deletions are shown before they run.",
    behavior: "You're on Daily Behavior. I can inspect proactive contact, quiet windows, and companionship cadence, then propose adjustments.",
  },
  "zh-CN": {
    regex: "我已看到你在消息过滤页。直接说想保留或去掉什么，我会先检查现有规则，再把修改交给你确认。",
    presets: "我已看到你在回复预设页。可以告诉我想要的语气、节奏和边界，我会先比较现有预设，再提交修改。",
    identity: "我已看到你在角色设定页。可以让我检查当前人设、补全关系设定，或创建一位新角色。所有改动都会先给你确认。",
    worldbook: "我已看到你在世界书页。说出希望角色记住的地点、人物或规则，我会整理成可触发的设定并请你确认。",
    memory: "我已看到你在记忆页。可以搜索、核对或修正记忆；修改和删除前都会明确展示。",
    behavior: "我已看到你在日常行为页。可以检查主动联系、静默窗口和陪伴节奏，再按你的偏好调整。",
  },
});

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? `{${key}}` : String(vars[key])));
}

export function normalizeAssistLocale(locale = getLocale()) {
  return locale === "en" ? "en" : "zh-CN";
}

export function assistT(key, vars = {}, locale = getLocale()) {
  const id = normalizeAssistLocale(locale);
  return interpolate(COPY[id]?.[key] ?? COPY["zh-CN"]?.[key] ?? key, vars);
}

export function assistContextLabel(context, locale = getLocale()) {
  const id = normalizeAssistLocale(locale);
  const key = String(context || "assist") || "assist";
  return CONTEXTS[id]?.[key] || key;
}

export function assistGreeting(context, locale = getLocale()) {
  const id = normalizeAssistLocale(locale);
  return GREETINGS[id]?.[context] || assistT("defaultGreeting", {}, id);
}

export function localizePackFields(pack, locale = getLocale()) {
  if (normalizeAssistLocale(locale) !== "en") return { label: pack.label, description: pack.description };
  const [label, description] = EN_PACKS[pack.id] || [pack.label, pack.description];
  return { label, description };
}

export function localizeToolLabel(toolId, fallback, locale = getLocale()) {
  return normalizeAssistLocale(locale) === "en" ? EN_TOOLS[toolId] || fallback : fallback;
}
