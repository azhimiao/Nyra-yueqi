/**
 * Actor-facing rules for Duo games. Titles are nicknames; these texts are
 * what the character agent must follow in chat.
 */

export const DUO_RULES = {
  "nyra.resonance":
    "这是光谱默契游戏，不是聊天闲聊。一端是光谱左极、一端是右极。出题方看到秘密目标位置，只能用一句不含数字、不含百分数的线索描述；猜题方根据线索报 0–100 的位置。轮到你出线索就给线索，轮到你猜就报数字。",
  "nyra.rating-guess":
    "这是互相打分并猜对方分数的游戏。针对当前题目，你要同时给出：你自己的分数，以及你猜测对方会给的分数。不要编造对方已经提交的数字。",
  "nyra.cipher":
    "这是词板暗号游戏（类似 Codenames），不是对暗号谈恋爱。棋盘上有词。轮到你出暗号时，给一个词 + 数量，提示己方词并避开危险格；轮到你猜时，指出棋盘上的词（用 index）。不要假装这是情侣暗号角色扮演。",
  "nyra.heartbeat":
    "这是数字默契出牌游戏（类似 The Mind），绝对不是真的对心跳、对呼吸或贴胸口。你和对方各自握有秘密数字手牌，轮流打出一张；全场已出的牌必须从小到大。你只能看到自己的手牌，看不到对方的牌。从手牌里选出你认为此刻该出的那张（通常较小的更安全）。合法动作是 {\"type\":\"play\",\"value\":手牌里的一个数字}。回复里必须明确说出你打出的数字。",
  "nyra.twenty-questions":
    "这是猜词游戏。一方心里有一个目标词，另一方用是/否问题逼近，最后可以猜词。出题方只能回答 yes / no / uncertain；猜题方只问问题或给出猜测。不要把游戏理解成随便闲聊。",
  "nyra.taboo":
    "这是禁忌描述游戏。出题方必须描述目标词，但不能说出目标词本身，也不能触碰禁忌用语。猜题方根据描述猜词。不要把「不能说的词」理解成调情暗示。",
  "nyra.secret-sequence":
    "这是破解长度 4 的秘密符号序列（类似 Mastermind）。猜的一方提交 4 个符号；系统会返回位置正确与仅值正确的数量。出题方不要主动泄露序列。",
  "nyra.if-we":
    "这是情境暗选游戏。针对同一情境，双方各自从选项里选一个，揭晓后看法是否一致。先按选项 id 做出选择，不要编造对方已经选了什么。",
  "nyra.leave-three":
    "这是秘密筛选排序游戏。从候选里秘密留下三个并排序。先提交你的三个选择，不要编造对方的名单。",
  "nyra.we-remember":
    "这是安全共享事实小测验。根据当前题目选项作答（optionIndex）。不要编造未给出的共同回忆。",
};

/**
 * @param {string} gameId
 * @returns {string}
 */
export function getDuoRules(gameId) {
  return DUO_RULES[String(gameId || "")] || "";
}
