/**
 * Fetch a page and extract title + excerpt (server-side).
 */

import { createHash } from "node:crypto";
import { validateFetchUrl, allowlistFromEnv } from "./ssrf.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

/**
 * @param {string} html
 */
export function extractTitleAndExcerpt(html) {
  const text = String(html || "");
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(stripTags(titleMatch?.[1] || "")).trim().slice(0, 200);

  let excerpt = "";
  const metaDesc = text.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ) || text.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  );
  if (metaDesc?.[1]) {
    excerpt = decodeEntities(metaDesc[1]).trim();
  }
  if (!excerpt) {
    const body = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    excerpt = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
  }
  excerpt = excerpt.slice(0, 600);
  return { title: title || "Untitled", excerpt };
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * @param {string} rawUrl
 * @param {{ query?: string, timeoutMs?: number, allowlistHostnames?: string[], fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchPage(rawUrl, opts = {}) {
  const allowlist = [
    ...allowlistFromEnv(),
    ...(Array.isArray(opts.allowlistHostnames) ? opts.allowlistHostnames : []),
  ];
  const validated = validateFetchUrl(rawUrl, { allowlistHostnames: allowlist });
  if (!validated.ok) {
    return { ok: false, reason: validated.reason, blocked: true };
  }

  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, reason: "fetch_unavailable" };
  }

  let current = validated.url;
  let redirects = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (redirects <= MAX_REDIRECTS) {
      const hopCheck = validateFetchUrl(current.toString(), { allowlistHostnames: allowlist });
      if (!hopCheck.ok) {
        return { ok: false, reason: hopCheck.reason, blocked: true };
      }

      const res = await fetchImpl(hopCheck.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "YueqiRetrievalBot/1.0 (+local-dev)",
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "redirect_missing_location" };
        let next;
        try {
          next = new URL(loc, hopCheck.url);
        } catch {
          return { ok: false, reason: "redirect_invalid" };
        }
        const nextCheck = validateFetchUrl(next.toString(), { allowlistHostnames: allowlist });
        if (!nextCheck.ok) {
          return { ok: false, reason: nextCheck.reason, blocked: true };
        }
        current = nextCheck.url;
        redirects += 1;
        continue;
      }

      if (!res.ok) {
        return { ok: false, reason: `http_${res.status}`, status: res.status };
      }

      const ctype = String(res.headers.get("content-type") || "").toLowerCase();
      if (
        ctype
        && !ctype.includes("text/")
        && !ctype.includes("json")
        && !ctype.includes("xml")
        && !ctype.includes("html")
      ) {
        return { ok: false, reason: "unsupported_mime", contentType: ctype };
      }

      const buf = Buffer.from(await res.arrayBuffer());
      const sliced = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
      const html = sliced.toString("utf8");
      const { title, excerpt } = extractTitleAndExcerpt(html);
      const fetchedAt = new Date().toISOString();
      const finalUrl = hopCheck.url.toString();
      const contentHash = createHash("sha256")
        .update(`${finalUrl}\n${title}\n${excerpt}`)
        .digest("hex")
        .slice(0, 32);

      return {
        ok: true,
        url: finalUrl,
        title,
        excerpt,
        fetchedAt,
        contentHash,
        freshness: "live",
        query: String(opts.query || "").trim(),
        publisher: hopCheck.url.hostname,
      };
    }
    return { ok: false, reason: "too_many_redirects" };
  } catch (err) {
    if (String(err?.name || "") === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "fetch_error", error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
