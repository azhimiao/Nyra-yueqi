const MCP_CARDS = [
  { id: "calendar", label: "日历", aliases: ["日历"] },
  { id: "location", label: "位置", aliases: ["位置"] },
  { id: "music", label: "音乐", aliases: ["音乐"] },
  { id: "album", label: "相册", aliases: ["相册"] },
  { id: "notification", label: "通知", aliases: ["通知"] },
];

export function listMcpCards() {
  return MCP_CARDS;
}

function resolveMcpCard(card) {
  const id = card.dataset.mcpId;
  if (id) return MCP_CARDS.find((item) => item.id === id) || null;
  const label = card.querySelector("strong")?.textContent?.trim();
  return MCP_CARDS.find((item) => item.label === label) || null;
}

function isContextEnabled(card) {
  const checkbox = card.querySelector("[data-mcp-context]");
  if (checkbox) return checkbox.checked;
  return card.classList.contains("is-on");
}

export function readGrantsFromDom(root = document) {
  // External integrations are no longer app-level switches. The OS permission
  // broker guards device access at execution time; this map only advertises
  // which integration surfaces exist when the external feature is enabled.
  const grants = Object.fromEntries(MCP_CARDS.map((entry) => [entry.id, true]));
  root.querySelectorAll(".mcp-card").forEach((card) => {
    const entry = resolveMcpCard(card);
    if (!entry) return;
    const enabled = isContextEnabled(card);
    grants[entry.id] = enabled;
    entry.aliases.forEach((alias) => {
      grants[alias] = enabled;
    });
  });
  return grants;
}

export function applyGrantsToDom(grants = {}, root = document) {
  root.querySelectorAll(".mcp-card").forEach((card) => {
    const entry = resolveMcpCard(card);
    if (!entry) return;
    const enabled = grants[entry.id] ?? grants[entry.label] ?? false;
    card.classList.toggle("is-on", Boolean(enabled));
    const checkbox = card.querySelector("[data-mcp-context]");
    if (checkbox) checkbox.checked = Boolean(enabled);
  });
}

export function grantsForPrompt(grants = {}, externalEnabled = true) {
  if (!externalEnabled) {
    return Object.fromEntries(MCP_CARDS.map((item) => [item.id, false]));
  }
  return grants;
}
