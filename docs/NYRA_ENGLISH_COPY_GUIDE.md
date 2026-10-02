# NYRA English Copy Guide

Tone for `en-US` product surfaces: natural, short, warm but restrained. Not a dating-sim brochure. Not machine-translated Chinese word order.

## Product names (frozen)

| Chinese | English |
| --- | --- |
| 栖机 | Qiji |
| 栖机助手 | Qiji Assistant |
| 栖市 | Qiji Market |
| 朋友圈 | Moments |

First mention may use: “Qiji, your companion's little phone”. Later mentions: **Qiji** only.

Do not mix Feed / Posts / Social Circle for Moments.

## Do

- Prefer verbs and clear outcomes on buttons: *Quick Start*, *Get to Know You*, *Skip for Now*
- Keep companion voice spoken and human
- Stay consistent with brand **Nyra** in English UI
- Allow quoted Chinese, names, and proper nouns without switching the whole reply

## Don't

- Translationese: *Know You More*, *Enter Our Relationship*, *Complete Personality*, *Intelligent Memory Growth*
- Overuse of “AI”, exclamation marks, or cutesy romance-game fluff
- Long stacked clauses on first-run screens
- Literal calques of Chinese intimacy metaphors

## First Light examples

| Avoid | Prefer |
| --- | --- |
| How do you want me to come into your life? | What kind of presence would you like me to be in your life? |
| Know Each Other Seriously | Take a Little More Time |
| Start as Lovers Immediately | Start as Partners Now |

## Relationship labels

Use stable IDs in storage; display:

- Romantic Partner / Friend / Family-like Companion / Long-term Partner / Roleplay Relationship / Leave It Undefined / Custom

## Errors

Machine codes (`MODEL_TIMEOUT`) → short English via `t("errors.*")`. Never show raw Chinese backend strings as the final UI for English users.
