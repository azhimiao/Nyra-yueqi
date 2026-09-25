import { getAllRecords, storeRecord, deleteRecord } from "../../storage/db.js";
import { tokenize } from "../../lib/utils.js";

const STORE = "palace_kg";

function factId(subject, predicate, object) {
  return `kg-${subject}-${predicate}-${object}`.replace(/\s+/g, "_").slice(0, 120);
}

export async function listKgFacts() {
  return getAllRecords(STORE);
}

export async function addKgFact({
  subject,
  predicate,
  object,
  validFrom,
  sourceDrawerId = "",
}) {
  const subj = String(subject || "用户").trim();
  const pred = String(predicate || "related_to").trim();
  const obj = String(object || "").trim();
  if (!obj) return null;

  await invalidateKgFacts(subj, pred);

  const record = {
    id: factId(subj, pred, obj),
    subject: subj,
    predicate: pred,
    object: obj,
    validFrom: validFrom || new Date().toISOString(),
    validUntil: null,
    invalidatedAt: null,
    sourceDrawerId,
  };
  await storeRecord(STORE, record);
  return record;
}

export async function invalidateKgFacts(subject, predicate) {
  const facts = await listKgFacts();
  const now = new Date().toISOString();
  await Promise.all(
    facts
      .filter(
        (fact) =>
          fact.subject === subject &&
          fact.predicate === predicate &&
          !fact.invalidatedAt
      )
      .map((fact) =>
        storeRecord(STORE, {
          ...fact,
          validUntil: now,
          invalidatedAt: now,
        })
      )
  );
}

export function isRelationalQuery(query = "") {
  return /谁|什么|什么时候|哪天|喜欢|讨厌|在一起|称呼|名字|记得|关系/.test(query);
}

export async function queryKg({ subject, predicate, object, at = new Date() } = {}) {
  const when = at instanceof Date ? at : new Date(at);
  const facts = await listKgFacts();

  return facts
    .filter((fact) => {
      if (fact.invalidatedAt) return false;
      if (fact.validFrom && new Date(fact.validFrom) > when) return false;
      if (fact.validUntil && new Date(fact.validUntil) <= when) return false;
      if (subject && fact.subject !== subject) return false;
      if (predicate && fact.predicate !== predicate) return false;
      if (object && !fact.object.includes(object)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom));
}

export async function getKgTimeline(subject) {
  const facts = await listKgFacts();
  return facts
    .filter((fact) => !subject || fact.subject === subject)
    .sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom));
}

export function inferKgSubjects(query = "") {
  const text = String(query);
  const subjects = new Set(["用户"]);
  if (/你|既白|角色|他|她/.test(text)) subjects.add("角色");
  if (/我们|一起/.test(text)) {
    subjects.add("用户");
    subjects.add("关系");
  }
  return [...subjects];
}

export async function extractKgFromText(text, sourceDrawerId = "") {
  const input = String(text || "");
  const extracted = [];

  const patterns = [
    { re: /(?:我|用户)(?:很)?喜欢(.{1,24}?)(?:[。！？\n]|$)/, predicate: "喜欢", subject: "用户" },
    { re: /(?:我|用户)(?:很)?讨厌(.{1,24}?)(?:[。！？\n]|$)/, predicate: "讨厌", subject: "用户" },
    { re: /(?:叫我|称呼我)(.{1,12}?)(?:[。！？\n]|$)/, predicate: "称呼", subject: "用户" },
    { re: /我们在一起(.{0,16})/, predicate: "在一起", subject: "关系" },
    { re: /(?:你|既白|角色)(?:很)?喜欢(.{1,24}?)(?:[。！？\n]|$)/, predicate: "喜欢", subject: "角色" },
    { re: /(?:你|既白|角色)(?:很)?讨厌(.{1,24}?)(?:[。！？\n]|$)/, predicate: "讨厌", subject: "角色" },
    { re: /(?:记得|记住)(.{1,20}?)(?:[。！？\n]|$)/, predicate: "记得", subject: "用户" },
    { re: /(?:决定|说好)(.{1,24}?)(?:[。！？\n]|$)/, predicate: "决定", subject: "关系" },
  ];

  for (const { re, predicate, subject } of patterns) {
    const match = input.match(re);
    if (!match?.[1]) continue;
    const object = match[1].trim();
    if (object.length < 2) continue;
    const fact = await addKgFact({
      subject,
      predicate,
      object,
      sourceDrawerId,
    });
    if (fact) extracted.push(fact);
  }

  return extracted;
}

export function formatKgBlock(facts = []) {
  if (!facts.length) return "";
  return facts
    .map(
      (fact, index) =>
        `${index + 1}. [${fact.subject} · ${fact.predicate}] ${fact.object}（自 ${fact.validFrom?.slice(0, 10) || "?"}）`
    )
    .join("\n");
}

export async function deleteKgFact(id) {
  return deleteRecord(STORE, id);
}

export function matchKgToQuery(query, facts) {
  const terms = new Set(tokenize(query));
  return facts.filter((fact) => {
    const blob = `${fact.subject} ${fact.predicate} ${fact.object}`;
    return tokenize(blob).some((term) => terms.has(term));
  });
}
