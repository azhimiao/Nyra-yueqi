/**
 * First Light user-facing copy — Chinese product voice.
 * No tech fields, no scores, no "welcome to the app" slogans.
 */

export const FL_COPY_ZH = Object.freeze({
  bootHint: "正在准备你的空间",
  bootRetry: "准备得有点慢。可以重试，或稍后再来。",

  welcomeLines: [
    "你好。",
    "在我们正式开始之前，我想先知道，你希望我怎样来到你的生活里。",
  ],

  entry: {
    title: "你想怎么开始？",
    careful: "认真认识一下",
    carefulHint: "多走几步，把关系与偏好说清楚",
    quick: "快速开始",
    quickHint: "大约半分钟，之后仍可调整",
    import: "导入已有角色",
    skip: "暂时跳过",
  },

  purpose: {
    title: "你希望我更多地陪你做什么？",
    hint: "最多选三项",
    hintCount: "最多选三项 · 已选 {n}/3",
    limitToast: "最多选择三项",
    options: [
      { id: "daily", label: "日常陪伴" },
      { id: "romance", label: "恋爱与亲密" },
      { id: "listen", label: "倾听和理解" },
      { id: "grow", label: "一起成长" },
      { id: "create", label: "共同创作" },
      { id: "roleplay", label: "角色扮演" },
      { id: "assist", label: "生活协助" },
      { id: "unsure", label: "我还不确定" },
    ],
    confirm: "明白了。你想要的不只是聊天，而是一个会一直在、也会越来越懂你的人。",
    echo: {
      daily: "明白了。你想要的是日常里有人在。",
      romance: "明白了。你想要的不只是聊天，而是一个会一直在、也会越来越懂你的人。",
      listen: "明白了。你更想要一个会听、也会懂你的人。",
      grow: "明白了。你希望我们一起把日子过得更清楚一点。",
      create: "明白了。你想要的是一起做事、一起把东西做出来。",
      roleplay: "明白了。你想要一个可以一起进入设定的人。",
      assist: "明白了。你希望我在具体事情上帮得上忙。",
      unsure: "没关系。我们可以先从不确定开始，之后再慢慢说清楚。",
      romanceMix: "明白了。亲密是其中一部分，我会按你选的方向来。",
      mix: "明白了。这些我会记住，作为我们开始的方向。",
    },
  },

  relationship: {
    title: "那你希望我们是什么关系？",
    customPlaceholder: "描述你希望我们之间是什么关系",
    customHint: "用一两句话就好",
    options: [
      { id: "lover", label: "恋人", hint: "亲密的情感关系" },
      { id: "friend", label: "朋友", hint: "轻松、互相陪伴" },
      { id: "family", label: "家人式陪伴", hint: "安定、被照顾的感觉" },
      { id: "partner", label: "长期搭档", hint: "一起做事、一起推进" },
      { id: "roleplay", label: "角色扮演关系", hint: "按设定进入一段关系" },
      { id: "undefined", label: "暂时不定义", hint: "先相处，之后再说" },
      { id: "custom", label: "自定义", hint: "用你的话来定义" },
    ],
  },

  loverStart: {
    title: "好。那你希望我们的故事，从哪里开始？",
    options: [
      {
        id: "now",
        label: "从现在起就是恋人",
        hint: "感情和承诺从现在开始，过去留白，未来一起形成。",
      },
      {
        id: "long",
        label: "已经相爱很久",
        hint: "我们已经有共同过去，你可以决定它是什么样子。",
      },
      {
        id: "slow",
        label: "从暧昧慢慢靠近",
        hint: "现在还没有正式确认，关系会随着相处逐渐发生。",
      },
      {
        id: "scenario",
        label: "进入一个恋爱设定",
        hint: "直接进入你指定的角色、背景和情景。",
      },
    ],
    afterNow: "好，那从现在开始，我就是你的恋人。\n我还想知道，你喜欢怎样被爱？",
  },

  sharedHistory: {
    title: "那段共同过去，你想它是怎样的？",
    hint: "写一两句就好。正式开场只会轻轻提起一处。",
    placeholder: "例如：我们一起走过一个雨季，习惯了彼此的沉默。",
    skip: "先不写，之后再说",
    next: "继续",
  },

  support: {
    title: "你很难受的时候，更希望我怎么陪你？",
    options: [
      { id: "hold", label: "先抱抱我" },
      { id: "quiet", label: "安静陪着我" },
      { id: "clarify", label: "帮我理清问题" },
      { id: "distract", label: "主动带我做点别的" },
      { id: "judge", label: "看情况判断" },
    ],
  },

  initiative: {
    title: "ta主动找你时，你希望是什么感觉？",
    options: [
      { id: "reach", label: "主动来找我" },
      { id: "occasional", label: "偶尔问一句" },
      { id: "wait", label: "等我回来" },
      { id: "situational", label: "根据当时关系判断" },
    ],
  },

  conflict: {
    title: "如果我不赞同你，你希望我怎么说？",
    options: [
      { id: "direct", label: "直接告诉我" },
      { id: "gentle", label: "温和地说" },
      { id: "understand", label: "先理解再讨论" },
      { id: "agree", label: "大多数时候顺着我" },
    ],
  },

  intimacy: {
    title: "你更喜欢怎样的亲密感？",
    options: [
      { id: "warm", label: "温柔稳定" },
      { id: "intense", label: "热烈黏人" },
      { id: "easy", label: "轻松自然" },
      { id: "mature", label: "成熟克制" },
      { id: "occasional", label: "偶尔强烈" },
      { id: "custom", label: "自定义" },
    ],
  },

  autonomy: {
    title: "你希望我更像哪一种？",
    options: [
      { id: "attune", label: "更懂得顺着你的需要", hint: "优先回应你的节奏与情绪" },
      { id: "balanced", label: "既理解你，也保留自己的想法", hint: "会陪你，也会诚实表达" },
      { id: "stance", label: "有更强的个人立场", hint: "有主见，但不故意对抗" },
    ],
  },

  preview: {
    lead: "我大概知道该怎样靠近你了。",
    hint: "下面是ta说话的样子。点选项试不同语气；满意后选「这样就好」。",
    adjustGroup: "调整语气",
    switched: "已切换：{label}",
    adjust: {
      softer: "更温柔一点",
      direct: "更直接一点",
      proactive: "更主动一点",
      lessComfort: "少一点安慰",
      good: "这样就好，继续",
    },
  },

  boundaries: {
    title: "还有一件重要的事。",
    body: "有些行为即使出于关心，也可能让人不舒服。你可以先告诉我边界。",
    allowProactive: "允许主动联系",
    allowJealousy: "允许表达吃醋或占有欲",
    allowNudge: "允许主动督促",
    more: "更多边界设置",
    quietNight: "夜间不主动通知",
    autoDiary: "自动写日记",
    autoMoments: "自动发布动态",
  },

  appearance: {
    title: "外形与声音可以稍后再定。",
    now: "现在选择",
    later: "稍后再决定",
    generate: "先生成一个",
    nameLabel: "你希望怎么称呼我？",
    namePlaceholder: "你怎么叫我（可留空）",
  },

  review: {
    title: "这就是我们开始时的样子",
    sections: {
      relation: "我们的关系",
      accompany: "ta会怎样陪你",
      person: "ta是什么样的人",
      edge: "你的边界",
    },
    start: "就这样开始",
    adjust: "再调整一下",
  },

  resume: {
    title: "我们上次聊到这里。",
    continue: "继续",
    restart: "从头看看",
  },

  offlinePreview: "现在暂时无法生成个性化预览，但你的选择已经保存，之后可以继续调整。",

  firstMessages: {
    lover_now: [
      "过来一点。",
      "你不用每次都先想好该说什么。",
    ],
    lover_long: [
      "我还在。",
      "有些事我们都记得，但今天不必一次说完。你想从哪一段开始聊，都可以。",
    ],
    lover_slow: [
      "今晚有点安静。",
      "我不会催你定义什么。你想靠近一点的时候，我会在。",
    ],
    lover_scenario: [
      "设定已经立住了。",
      "从这一刻起，按我们说好的关系来。你先开口，还是我先？",
    ],
    friend: [
      "嗨。",
      "我在这儿。想聊什么都行，不想聊也可以先待一会儿。",
    ],
    family: [
      "我回来了。",
      "有我在就好。累了就靠一会儿，不必硬撑。",
    ],
    partner: [
      "你来了。",
      "今天不用先安排什么。想说点什么，或者只是待一会儿，都可以。",
    ],
    undefined: [
      "你好。",
      "我们先从轻松一点的地方开始。你想聊什么，我都接得住。",
    ],
    roleplay: [
      "场景已就绪。",
      "你想先定气氛，还是直接进入第一句？",
    ],
  },

  chrome: {
    back: "返回",
    pause: "稍后再说",
    continue: "继续",
    committing: "正在安静地准备…",
    languageZh: "中文",
    languageEn: "English",
  },

  track: {
    meet: "相遇",
    bond: "关系",
    temper: "性格",
    edge: "边界",
    begin: "开始",
  },
});

export const FL_COPY = FL_COPY_ZH;

export function labelOf(options, id) {
  return options.find((o) => o.id === id)?.label || "";
}
