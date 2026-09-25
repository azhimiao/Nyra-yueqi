/** First Light preview is structural only; it never creates opening prose. */

const FORBIDDEN_TONE = /(作为人工智能|我是大模型|根据你刚才的选择|问卷|客服)/;

export function deterministicPreview(state) {
  void state;
  return {
    source: "empty",
    text: "",
    specificDetails: 0,
    questionnaireRecap: false,
  };
}

export function countSpecificDetails(text, draft) {
  let n = 0;
  const name = draft?.character?.name?.value;
  const gender = draft?.character?.genderIdentity?.value;
  const callUserAs = draft?.preference?.callUserAs?.value;
  const rel = draft?.preference?.relationshipType?.value;
  const blob = String(text || "");
  if (name && blob.includes(String(name))) n += 1;
  if (gender && blob.includes(String(gender))) n += 1;
  if (callUserAs && blob.includes(String(callUserAs))) n += 1;
  if (rel && blob.includes(String(rel))) n += 1;
  return n;
}

export async function previewFirstLightV2(state, opts = {}) {
  void opts;
  return deterministicPreview(state);
}

export function firstRealMessageFromCommit(commit) {
  const text = String(commit?.firstMessage || "").trim();
  return {
    text,
    specificDetails: countSpecificDetails(text, {
      character: { name: { value: commit?.character?.name }, genderIdentity: { value: commit?.character?.selfIdentity?.genderIdentity } },
      preference: {
        callUserAs: commit?.preference?.userIdentity?.callUserAs,
        relationshipType: commit?.preference?.relationship?.type,
      },
    }),
    inventedHistory: /记得我们|去年|小时候一起/.test(text) && !/约定|设定/.test(text),
  };
}
