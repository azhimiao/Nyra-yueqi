import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_RE = /^\+[1-9]\d{0,2}$/;
const PHONE_SEPARATOR_RE = /[\s().-]/g;

function safeEqual(leftRaw, rightRaw) {
  const left = Buffer.from(String(leftRaw || ""));
  const right = Buffer.from(String(rightRaw || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeUsername(raw) {
  const username = String(raw || "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new TypeError("invalid username");
  }
  return username;
}

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new TypeError("invalid email");
  }
  return email;
}

export function normalizePhone(countryCodeRaw, nationalNumberRaw) {
  const countryCode = String(countryCodeRaw || "").trim();
  const nationalNumber = String(nationalNumberRaw || "").trim().replace(PHONE_SEPARATOR_RE, "");
  const phone = `${countryCode}${nationalNumber}`;
  if (
    !COUNTRY_CODE_RE.test(countryCode)
    || !/^\d{5,14}$/.test(nationalNumber)
    || !/^\+[1-9]\d{7,14}$/.test(phone)
  ) {
    throw new TypeError("invalid phone");
  }
  return phone;
}

export function findUserByIdentifier(users = {}, rawIdentifier = "") {
  const identifier = String(rawIdentifier || "").trim().toLowerCase();
  if (!identifier) return null;
  return Object.values(users).find((user) => (
    String(user?.username || "").toLowerCase() === identifier
    || String(user?.email || "").toLowerCase() === identifier
    || String(user?.phone || "").toLowerCase() === identifier
  )) || null;
}

export function hashDeviceFingerprint({
  platformDeviceId,
  installationId,
  secret,
} = {}) {
  const platform = String(platformDeviceId || "").trim();
  const installation = String(installationId || "").trim();
  if (
    installation.length < 16
    || installation.length > 128
    || platform.length > 256
    || String(secret || "").length < 8
  ) {
    throw new TypeError("invalid device fingerprint");
  }
  return createHmac("sha256", secret)
    .update(`v1:${platform || "web"}:${installation}`)
    .digest("hex");
}

export function registrationDeviceDecision({
  record,
  maxAccounts = 3,
} = {}) {
  const users = new Set(
    Array.isArray(record?.userIds) ? record.userIds.filter(Boolean) : [],
  );
  const limit = Math.max(1, Number(maxAccounts) || 3);
  return {
    allowed: users.size < limit,
    accountCount: users.size,
    maxAccounts: limit,
  };
}

function otpMaterial({ email, purpose, pepper, code }) {
  return `${normalizeEmail(email)}:${String(purpose)}:${String(pepper)}:${String(code)}`;
}

export async function createEmailOtp({
  email,
  purpose,
  pepper,
  now = Date.now(),
  ttlMs,
  code,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const nextCode = String(code || Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0"));
  if (!/^\d{6}$/.test(nextCode)) throw new TypeError("invalid otp code");
  const salt = randomBytes(16).toString("hex");
  const codeHash = scryptSync(
    otpMaterial({ email: normalizedEmail, purpose, pepper, code: nextCode }),
    salt,
    32,
  ).toString("hex");
  return {
    code: nextCode,
    record: {
      id: randomBytes(16).toString("hex"),
      email: normalizedEmail,
      purpose: String(purpose),
      salt,
      codeHash,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + Number(ttlMs || 15 * 60_000)).toISOString(),
      consumedAt: null,
    },
  };
}

export async function consumeEmailOtp({
  records = [],
  email,
  purpose,
  code,
  pepper,
  now = Date.now(),
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const candidates = records
    .filter((record) => (
      record?.email === normalizedEmail
      && record?.purpose === String(purpose)
      && !record?.consumedAt
      && Date.parse(record?.expiresAt || "") > now
    ))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
  for (const record of candidates) {
    const actual = scryptSync(
      otpMaterial({ email: normalizedEmail, purpose, pepper, code }),
      record.salt,
      32,
    ).toString("hex");
    if (safeEqual(actual, record.codeHash)) {
      record.consumedAt = new Date(now).toISOString();
      return true;
    }
  }
  return false;
}

export function issueSession({
  sessions,
  userId,
  secret,
  now = Date.now(),
  ttlMs,
  nonce = randomBytes(24).toString("base64url"),
} = {}) {
  const expiresAt = now + Number(ttlMs || 30 * 24 * 60 * 60_000);
  const signed = `${userId}.${nonce}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(signed).digest("base64url");
  sessions[nonce] = {
    userId,
    expiresAt,
    createdAt: new Date(now).toISOString(),
  };
  const token = Buffer.from(JSON.stringify({
    u: userId,
    n: nonce,
    e: expiresAt,
    s: signature,
  })).toString("base64url");
  return { token, nonce, expiresAt };
}

export function verifySession({
  sessions = {},
  token,
  secret,
  now = Date.now(),
} = {}) {
  try {
    const payload = JSON.parse(Buffer.from(String(token || ""), "base64url").toString("utf8"));
    const userId = String(payload?.u || "");
    const nonce = String(payload?.n || "");
    const expiresAt = Number(payload?.e || 0);
    const signature = String(payload?.s || "");
    const stored = sessions[nonce];
    if (
      !userId
      || !nonce
      || !signature
      || expiresAt <= now
      || stored?.userId !== userId
      || Number(stored?.expiresAt) !== expiresAt
    ) return null;
    const expected = createHmac("sha256", secret)
      .update(`${userId}.${nonce}.${expiresAt}`)
      .digest("base64url");
    return safeEqual(signature, expected) ? userId : null;
  } catch {
    return null;
  }
}
