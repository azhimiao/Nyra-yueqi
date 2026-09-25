/**
 * Local committed character revision history. Restore creates a new revision.
 */

const MAX_REVISIONS = 20;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createRevisionRepository({ storage, keyPrefix = "yueqi.character.revisions.v1:" } = {}) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : {
    _data: {},
    getItem(key) { return this._data[key] ?? null; },
    setItem(key, value) { this._data[key] = String(value); },
  });

  function keyFor(characterId) {
    return `${keyPrefix}${characterId}`;
  }

  function list(characterId) {
    try {
      const raw = JSON.parse(store.getItem(keyFor(characterId)) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function write(characterId, items) {
    store.setItem(keyFor(characterId), JSON.stringify(items.slice(-MAX_REVISIONS)));
    return list(characterId);
  }

  function snapshot(character, reason = "save") {
    const id = String(character?.id || "").trim();
    if (!id) throw new TypeError("character_id_required");
    const history = list(id);
    const entry = {
      revision: Number(character.revision) || history.length + 1,
      reason,
      savedAt: new Date().toISOString(),
      record: clone(character),
    };
    history.push(entry);
    return write(id, history);
  }

  function restore(characterId, revision) {
    const history = list(characterId);
    const found = history.find((item) => item.revision === Number(revision));
    if (!found) return { ok: false, reason: "revision_not_found" };
    const restored = clone(found.record);
    const latest = history[history.length - 1]?.revision || restored.revision || 1;
    restored.revision = latest + 1;
    restored.restoredFromRevision = found.revision;
    snapshot(restored, "restore");
    return { ok: true, record: restored, history: list(characterId) };
  }

  function diff(characterId, fromRevision, toRevision) {
    const history = list(characterId);
    const a = history.find((item) => item.revision === Number(fromRevision))?.record;
    const b = history.find((item) => item.revision === Number(toRevision))?.record;
    if (!a || !b) return { ok: false, reason: "revision_not_found" };
    const keys = ["name", "alias", "profile.promptSystem", "profile.promptDeveloper", "selfIdentity.genderIdentity"];
    const changes = [];
    for (const path of keys) {
      const read = (obj) => path.split(".").reduce((acc, key) => acc?.[key], obj);
      const left = read(a);
      const right = read(b);
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        changes.push({ path, from: left, to: right });
      }
    }
    return { ok: true, changes };
  }

  return { list, snapshot, restore, diff, max: MAX_REVISIONS };
}
