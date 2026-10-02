import { callModel } from "../model/client.js";

const queue = [];
let running = false;
const MAX_RETRIES = 2;

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        const result = await job.run();
        job.resolve?.(result);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt > MAX_RETRIES) job.reject?.(error);
      }
    }
  }
  running = false;
}

export function enqueuePerceptionJob(run) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject });
    drain().catch(() => {});
  });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

export async function summarizeImage(record, deps = {}) {
  const config = deps.collectProviderConfig?.() || {};
  if (!config.baseUrl || !config.apiKey || !config.model || !record) {
    return { summary: record?.name || "", tags: [] };
  }
  try {
    const blob = record.blob || (await deps.readMediaBlob?.(record));
    if (!blob) return { summary: record.name || "", tags: [] };
    const dataUrl = await blobToDataUrl(blob);
    const result = await callModel(
      config,
      [
        { role: "system", content: "用一句话描述图片内容或氛围，不超过 30 字。" },
        {
          role: "user",
          content: [
            { type: "text", text: `图片文件名：${record.name || "photo"}` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      {
        temperature: 0.35,
        stream: false,
        businessPurpose: "vision.media_perception",
        capability: "vision",
      }
    );
    return { summary: result.content.trim(), tags: [] };
  } catch {
    return { summary: record?.name || "", tags: [] };
  }
}

export async function summarizePhoto(photo, mediaRecord, deps = {}) {
  const result = await summarizeImage(mediaRecord, deps);
  return { summary: result.summary || photo?.title || "", mood: photo?.tone || "" };
}

export async function chunkBook(book) {
  if (!book?.excerpt) return { chunks: [] };
  const { splitDrawerText } = await import("../memory/palace/chunk.js");
  return { chunks: splitDrawerText(book.excerpt).slice(0, 8) };
}
