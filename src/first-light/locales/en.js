/**
 * First Light — English (en-US) product copy.
 * Natural English; not a literal translation of zh-CN.
 */

export const FL_COPY_EN = Object.freeze({
  bootHint: "Preparing your space",
  bootRetry: "This is taking longer than usual. You can retry, or come back later.",

  welcomeLines: [
    "Hi.",
    "Before we begin, I'd like to understand how you'd like me to be part of your life.",
  ],

  entry: {
    title: "How would you like to begin?",
    careful: "Take a Little More Time",
    carefulHint: "A few more steps to shape the relationship and preferences",
    quick: "Quick Start",
    quickHint: "About half a minute — you can refine later",
    import: "Import a Character",
    skip: "Skip for Now",
  },

  purpose: {
    title: "What would you most like me to share with you?",
    hint: "Choose up to three",
    hintCount: "Up to three · {n}/3 selected",
    limitToast: "Choose up to three",
    options: [
      { id: "daily", label: "Everyday company" },
      { id: "romance", label: "Romance and closeness" },
      { id: "listen", label: "Listening and understanding" },
      { id: "grow", label: "Growing together" },
      { id: "create", label: "Creating together" },
      { id: "roleplay", label: "Roleplay" },
      { id: "assist", label: "Practical help" },
      { id: "unsure", label: "I'm not sure yet" },
    ],
    confirm: "Understood. You're looking for more than chat — someone who stays, and learns you over time.",
    echo: {
      daily: "Understood. You want someone present in ordinary days.",
      romance: "Understood. You're looking for more than chat — someone who stays, and learns you over time.",
      listen: "Understood. You want someone who listens, and actually hears you.",
      grow: "Understood. You want us to grow the days a little clearer together.",
      create: "Understood. You want someone to make things with.",
      roleplay: "Understood. You want someone who can step into a scene with you.",
      assist: "Understood. You want help with the practical parts.",
      unsure: "That's alright. We can start from not knowing, and name it later.",
      romanceMix: "Understood. Closeness is part of it — I'll follow the mix you chose.",
      mix: "Understood. I'll keep these as the direction we start from.",
    },
  },

  relationship: {
    title: "What kind of relationship should we have?",
    customPlaceholder: "Describe the relationship you want",
    customHint: "A sentence or two is enough",
    options: [
      { id: "lover", label: "Romantic Partner", hint: "An intimate emotional bond" },
      { id: "friend", label: "Friend", hint: "Easy company" },
      { id: "family", label: "Family-like Companion", hint: "Steady, looked-after" },
      { id: "partner", label: "Long-term Partner", hint: "Build and move things together" },
      { id: "roleplay", label: "Roleplay Relationship", hint: "Step into a scene you choose" },
      { id: "undefined", label: "Leave It Undefined", hint: "Start, and name it later" },
      { id: "custom", label: "Custom", hint: "Define it in your own words" },
    ],
  },

  loverStart: {
    title: "Alright. Where should our story begin?",
    options: [
      {
        id: "now",
        label: "Start as Partners Now",
        hint: "Feelings and commitment begin today. The past stays open; we shape what comes next.",
      },
      {
        id: "long",
        label: "We've Already Been Together",
        hint: "We share a past you can define.",
      },
      {
        id: "slow",
        label: "Let It Grow Slowly",
        hint: "Nothing is formally settled yet. Closeness can unfold as we go.",
      },
      {
        id: "scenario",
        label: "Enter a Romantic Scenario",
        hint: "Step into a role, setting, and situation you choose.",
      },
    ],
    afterNow: "Alright — from this moment, I'm your partner.\nI'd still like to know how you prefer to be loved.",
  },

  sharedHistory: {
    title: "What should that shared past feel like?",
    hint: "A line or two is enough. The opening will only gently touch one detail.",
    placeholder: "For example: We walked through a rainy season and grew used to each other's silence.",
    skip: "Skip for now",
    next: "Continue",
  },

  support: {
    title: "When you're hurting, how should I stay with you?",
    options: [
      { id: "hold", label: "Hold me first" },
      { id: "quiet", label: "Sit with me quietly" },
      { id: "clarify", label: "Help me sort it out" },
      { id: "distract", label: "Gently pull me elsewhere" },
      { id: "judge", label: "Read the moment" },
    ],
  },

  initiative: {
    title: "When they reach out, what should it feel like?",
    options: [
      { id: "reach", label: "Reach out" },
      { id: "occasional", label: "Check in once in a while" },
      { id: "wait", label: "Wait for you" },
      { id: "situational", label: "Decide from how things feel" },
    ],
  },

  conflict: {
    title: "If I disagree with you, how should I say so?",
    options: [
      { id: "direct", label: "Tell me directly" },
      { id: "gentle", label: "Say it gently" },
      { id: "understand", label: "Understand first, then talk" },
      { id: "agree", label: "Usually go along with me" },
    ],
  },

  intimacy: {
    title: "What kind of closeness feels right?",
    options: [
      { id: "warm", label: "Warm and steady" },
      { id: "intense", label: "Warm and clingy" },
      { id: "easy", label: "Easy and natural" },
      { id: "mature", label: "Mature and restrained" },
      { id: "occasional", label: "Occasionally intense" },
      { id: "custom", label: "Custom" },
    ],
  },

  autonomy: {
    title: "Which feels closer to what you want?",
    options: [
      { id: "attune", label: "More attuned to your needs", hint: "Prioritize your pace and feelings" },
      { id: "balanced", label: "Understand you, and keep their own mind", hint: "Present with you, honest when it matters" },
      { id: "stance", label: "A stronger personal stance", hint: "Has opinions, without picking fights" },
    ],
  },

  preview: {
    lead: "I think I know how to come closer.",
    hint: "This is how they might speak. Tap an option to try a different tone; when it feels right, choose “This feels right”.",
    adjustGroup: "Adjust tone",
    switched: "Switched to: {label}",
    adjust: {
      softer: "A little softer",
      direct: "A little more direct",
      proactive: "A little more proactive",
      lessComfort: "Less comforting",
      good: "This feels right — continue",
    },
  },

  boundaries: {
    title: "One more important thing.",
    body: "Even care can cross a line. You can set boundaries first.",
    allowProactive: "Allow proactive contact",
    allowJealousy: "Allow jealousy or possessiveness",
    allowNudge: "Allow gentle nudges",
    more: "More boundary settings",
    quietNight: "No proactive notices at night",
    autoDiary: "Write diary automatically",
    autoMoments: "Post moments automatically",
  },

  appearance: {
    title: "Looks and voice can wait.",
    now: "Choose now",
    later: "Decide later",
    generate: "Generate one for now",
    nameLabel: "What do you want to call me?",
    namePlaceholder: "How you'll call me (optional)",
  },

  review: {
    title: "This is how we begin",
    sections: {
      relation: "Our relationship",
      accompany: "How they'll stay with you",
      person: "Who they are",
      edge: "Your boundaries",
    },
    start: "Begin like this",
    adjust: "Adjust a little",
  },

  resume: {
    title: "We left off here.",
    continue: "Continue",
    restart: "Start over",
  },

  offlinePreview: "A personalized preview isn't available right now, but your choices are saved and you can refine them later.",

  firstMessages: {
    lover_now: [
      "Come a little closer.",
      "You don't have to rehearse what to say.",
    ],
    lover_long: [
      "I'm still here.",
      "We remember some things — we don't need to say them all today. Wherever you want to begin is fine.",
    ],
    lover_slow: [
      "It's quiet tonight.",
      "I won't rush you to define this. When you want to come closer, I'll be here.",
    ],
    lover_scenario: [
      "The scene is set.",
      "From this moment, we follow what we agreed. Do you want to speak first, or shall I?",
    ],
    friend: [
      "Hey.",
      "I'm here. We can talk about anything — or just sit for a bit.",
    ],
    family: [
      "I'm back.",
      "You don't have to hold it alone. Rest if you need to.",
    ],
    partner: [
      "You're here.",
      "Nothing has to be planned first. Say whatever comes to mind, or just stay a while.",
    ],
    undefined: [
      "Hi.",
      "We can start light. Whatever you want to talk about, I can meet you there.",
    ],
    roleplay: [
      "Scene ready.",
      "Want to set the mood first, or jump straight to the first line?",
    ],
  },

  chrome: {
    back: "Back",
    pause: "Later",
    continue: "Continue",
    committing: "Getting ready quietly…",
    languageZh: "中文",
    languageEn: "English",
  },

  track: {
    meet: "Meet",
    bond: "Bond",
    temper: "Temper",
    edge: "Bounds",
    begin: "Begin",
  },
});

export function labelOf(options, id) {
  return options.find((o) => o.id === id)?.label || "";
}
