/**
 * Stable portability error codes + user-facing copy.
 * Technical codes stay in logs; UI uses messageForPortabilityError().
 */

export const PORTABILITY_ERRORS = Object.freeze({
  archive_unsupported_version: {
    zh: "这个数据包来自更新版本的月栖，当前版本还无法导入。",
    en: "This archive comes from a newer Nyra version and cannot be imported yet.",
  },
  archive_auth_failed: {
    zh: "无法打开数据包。密码不正确，或文件已损坏。",
    en: "Could not open the archive. Wrong passphrase or the file is damaged.",
  },
  archive_limit_exceeded: {
    zh: "数据包过大或条目过多，已超过安全限制。",
    en: "The archive exceeds size or entry safety limits.",
  },
  archive_invalid_path: {
    zh: "数据包包含不安全的文件路径，已拒绝导入。",
    en: "The archive contains unsafe paths and was rejected.",
  },
  archive_schema_invalid: {
    zh: "数据包格式不正确，无法导入。",
    en: "The archive format is invalid and cannot be imported.",
  },
  archive_checksum_mismatch: {
    zh: "数据包损坏，校验未通过。",
    en: "Archive checksum failed. The file appears corrupted.",
  },
  archive_incompatible: {
    zh: "数据包与当前月栖不兼容。",
    en: "This archive is incompatible with the current app.",
  },
  archive_insufficient_space: {
    zh: "设备可用空间不足，无法完成导入。",
    en: "Not enough free space to finish the import.",
  },
  archive_commit_failed: {
    zh: "导入提交失败，已尝试恢复到导入前状态。",
    en: "Import commit failed. The previous local state was restored when possible.",
  },
  archive_cancelled: {
    zh: "已取消导入。",
    en: "Import cancelled.",
  },
  nychar_unsupported_version: {
    zh: "这个角色包来自更新版本，当前无法导入。",
    en: "This character package requires a newer Nyra version.",
  },
  nychar_schema_invalid: {
    zh: "角色包格式不正确。",
    en: "The character package format is invalid.",
  },
  nychar_forbidden_user_data: {
    zh: "角色包包含不应出现的私人用户数据，已拒绝。",
    en: "The character package contains private user data and was rejected.",
  },
  nychar_checksum_mismatch: {
    zh: "角色包资源校验失败。",
    en: "Character package asset checksum failed.",
  },
  nychar_component_missing: {
    zh: "角色包缺少必要组件。",
    en: "The character package is missing required components.",
  },
  nychar_reference_missing: {
    zh: "角色包引用了不存在的资源。",
    en: "The character package references a missing asset.",
  },
  nychar_forbidden_executable: {
    zh: "角色包包含不允许的可执行内容。",
    en: "The character package contains forbidden executable content.",
  },
  nychar_unsupported_media: {
    zh: "角色包包含不支持的媒体类型。",
    en: "The character package contains unsupported media.",
  },
  nychar_limit_exceeded: {
    zh: "角色包过大，已超过安全限制。",
    en: "The character package exceeds safety limits.",
  },
  nychar_invalid_path: {
    zh: "角色包路径不安全。",
    en: "The character package contains unsafe paths.",
  },
  book_unsupported_format: {
    zh: "暂不支持这种书籍格式。",
    en: "This book format is not supported yet.",
  },
  book_limit_exceeded: {
    zh: "书籍文件过大。",
    en: "The book file is too large.",
  },
  book_decode_failed: {
    zh: "无法读取这本书。",
    en: "Could not read this book.",
  },
  book_no_readable_content: {
    zh: "这本书没有可读内容。",
    en: "This book has no readable content.",
  },
  book_storage_failed: {
    zh: "书籍无法保存到本地。",
    en: "Could not store this book locally.",
  },
  audio_unsupported_format: {
    zh: "暂不支持这种音频格式。",
    en: "This audio format is not supported yet.",
  },
  audio_limit_exceeded: {
    zh: "音频文件过大。",
    en: "The audio file is too large.",
  },
  audio_decode_failed: {
    zh: "无法读取这段音频。",
    en: "Could not read this audio file.",
  },
  audio_storage_failed: {
    zh: "音频无法保存到本地。",
    en: "Could not store this audio locally.",
  },
  card_json_invalid: {
    zh: "角色卡 JSON 无法识别。",
    en: "Could not recognize this character card JSON.",
  },
  card_embedded_json_missing: {
    zh: "图片里没有找到可用的角色卡数据。",
    en: "No usable character-card data was found in the image.",
  },
});

export class PortabilityError extends Error {
  /**
   * @param {string} code
   * @param {string} [detail]
   * @param {object} [extra]
   */
  constructor(code, detail = "", extra = {}) {
    super(detail || code);
    this.name = "PortabilityError";
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }
}

/**
 * @param {unknown} err
 * @param {"zh"|"en"} [locale]
 */
export function messageForPortabilityError(err, locale = "zh") {
  const code = err?.code || (typeof err === "string" ? err : "");
  const entry = PORTABILITY_ERRORS[code];
  if (entry) return entry[locale] || entry.zh || entry.en;
  if (err?.message && !/^[a-z0-9_]+$/i.test(String(err.message))) return String(err.message);
  return locale === "en"
    ? "Something went wrong while moving data."
    : "迁移数据时出了点问题。";
}
