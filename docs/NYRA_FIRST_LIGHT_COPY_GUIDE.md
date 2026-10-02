# First Light Copy Guide

Source of truth: `src/first-light/copy.js` (`FL_COPY`).

## Voice

- Calm, adult, intimate when relationship is already chosen
- No exclamation spam, no gaming slang as system default
- Never expose `supportStyle`, scores, or confidence numbers
- Never use “生成成功！欢迎进入月栖！”

## Relationship timing

After user chooses **从现在起就是恋人**, next beat uses:

> 好，那从现在开始，我就是你的恋人。  
> 我还想知道，你喜欢怎样被爱？

Not stranger-questionnaire tone.

## Purpose confirm (template)

> 明白了。你想要的不只是聊天，而是一个会一直在、也会越来越懂你的人。

Rule/template — no model required.

## Review blocks (natural language)

Titles only:

1. 我们的关系  
2. 她会怎样陪你  
3. 她是什么样的人  
4. 你的边界  

Body text built in `presets.js` → `buildReviewSections`.

## First real messages

Keyed by mode in `FL_COPY.firstMessages`:

| Mode | Tone |
| --- | --- |
| `lover_now` | Immediate intimacy |
| `lover_long` | Continuity; may cite **one** shared-history fragment |
| `lover_slow` | Attraction without formal promise |
| `friend` / `family` / `partner` / `undefined` / `roleplay` | Matching register |

## Offline preview notice

> 现在暂时无法生成个性化预览，但你的选择已经保存，之后可以继续调整。

## Resume

> 我们上次聊到这里。  
> 继续 / 从头看看
