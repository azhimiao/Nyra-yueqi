# Game Package Format (Launch v1)

Validator: `src/games/platform/package.js` → `validateGamePackage(raw)`.

## Kinds

### `nyra.duo-game.v1`

```json
{
  "kind": "nyra.duo-game.v1",
  "id": "nyra.resonance",
  "version": "1",
  "title": "同频",
  "description": "…",
  "runtime": "duo",
  "players": { "human": 1, "character": 1 }
}
```

### `nyra.group-game.v1`

```json
{
  "kind": "nyra.group-game.v1",
  "id": "nyra.undercover",
  "version": "1.0.0",
  "title": "谁是卧底",
  "description": "…",
  "runtime": "group",
  "players": { "min": 4, "max": 10 },
  "features": { "privateInformation": true, "voting": true }
}
```

Also accepted for lobby aggregation: `kind: "native"` | `"yeos"`.

## Forbidden fields

Packages must **not** include executable payload keys: `script`, `scripts`, `eval`, `module`, `entrypointJs`, `nativeCode`, `remoteScript` (recursive scan).

## Shipping model

Launch v1 ships in-repo modules under `src/games/duo/games/` and `src/games/group/games/`. External register validates only (`registerExternalPackage` → `builtin_only_v1`).
