/** Built-in chapter 1 — 缺页（互动阅读，非 VN）. */

/** @type {import("../schema.js").StoryChapter} */
export const CH1_MISSING_PAGE = {
  id: "ch1-missing-page",
  title: "缺页",
  hook: "书页中间少了一角，墨迹却还在发热。",
  theme: "ink",
  startNodeId: "n1",
  version: 1,
  nodes: [
    {
      id: "n1",
      kind: "beat",
      body: "雨后的窗台。一本没有封面的薄书摊开，中间缺了一页——撕痕很新，像刚被谁匆忙拿走。\n\n空气里有一点薄荷与纸灰的味道。",
      nextNodeId: "n2",
    },
    {
      id: "n2",
      kind: "choice",
      body: "你怎么做？",
      choices: [
        { id: "c-closer", label: "凑近看撕痕", nextNodeId: "n3a" },
        { id: "c-shelf", label: "先把书合上", nextNodeId: "n3b" },
      ],
    },
    {
      id: "n3a",
      kind: "beat",
      body: "撕口内侧有一行极淡的字：「别让 TA 看见这一页。」字迹被雨气洇开，像故意留着给你读。\n\n桌角还压着一张未写完的便签。",
      nextNodeId: "n4a",
    },
    {
      id: "n3b",
      kind: "beat",
      body: "合上书时，书脊轻轻响了一下。夹层里滑出半截丝带——另一头似乎还连着什么。\n\n你犹豫了一秒。",
      nextNodeId: "n4b",
    },
    {
      id: "n4a",
      kind: "choice",
      body: "便签空白处，你写：",
      choices: [
        { id: "c-reply", label: "「我看见了」", nextNodeId: "end-seen" },
        { id: "c-keep", label: "把便签夹进日记", nextNodeId: "end-keep" },
      ],
    },
    {
      id: "n4b",
      kind: "choice",
      body: "丝带的另一端：",
      choices: [
        { id: "c-pull", label: "轻轻拉开", nextNodeId: "end-pull" },
        { id: "c-leave", label: "先不动它", nextNodeId: "end-keep" },
      ],
    },
    {
      id: "end-seen",
      kind: "ending",
      endingTitle: "对视",
      endingSummary: "你把「我看见了」留在便签上。窗外雨停，缺页的故事暂时停在你们之间——还没说完，但已经开始。",
      body: "你把「我看见了」留在便签上。窗外雨停，缺页的故事暂时停在你们之间——还没说完，但已经开始。",
    },
    {
      id: "end-keep",
      kind: "ending",
      endingTitle: "收进日记",
      endingSummary: "你没有追问撕痕。日记夹住那一角空白，像把秘密轻轻压平。夜里翻开时，墨气还在。",
      body: "你没有追问撕痕。日记夹住那一角空白，像把秘密轻轻压平。夜里翻开时，墨气还在。",
    },
    {
      id: "end-pull",
      kind: "ending",
      endingTitle: "丝带那头",
      endingSummary: "丝带尽头是一张折好的缺页。纸上只有一句：「下次见面，再读给你听。」你把它放回书里，像放回一场未完的约会。",
      body: "丝带尽头是一张折好的缺页。纸上只有一句：「下次见面，再读给你听。」你把它放回书里，像放回一场未完的约会。",
    },
  ],
};

export default CH1_MISSING_PAGE;
