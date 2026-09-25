export function canonicalJson(value) {
  return JSON.stringify(value ?? null);
}

export async function verifySignedUpdateManifest() {
  throw new Error("updates_disabled");
}
