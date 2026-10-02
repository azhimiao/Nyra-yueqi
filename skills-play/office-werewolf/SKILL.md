---
name: office-werewolf
id: office-werewolf
version: 1.0.0
description: >-
  办公室狼人杀（社交局）。不要在探索单人对话里开；请从探索「一起玩 → 带到 Pop」
  或在 Pop 会话里点「+ → 一起玩」发起，和伴侣/群友同场。
category: play
surface: pop-social
triggers: [狼人杀, 办公室, 推理, 群聊]
allowedActions: [REPLY, REFLECT]
disable-model-invocation: true
---

# 办公室狼人杀（Pop / 群）

本包为 **pop-social**：探索不会自动种子进 Agent。  
权威玩法文案在 `src/games/pop-games.js` 的 `office-werewolf` 条目。
