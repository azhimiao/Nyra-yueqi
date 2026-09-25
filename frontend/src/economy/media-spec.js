/**
 * 数字市场作品媒体规格（角色上传 / 官方上架共用）
 *
 * 封面与图像作品统一竖图 2:3（2048×3072）。
 * 详情头图按淘宝式 1:1 预览框展示，图在框内等比缩小完整可见；
 * 列表卡允许轻微裁切以保持网格整齐。
 */
export const MARKET_MEDIA = Object.freeze({
  coverAspect: "2:3",
  coverAspectRatio: 2 / 3,
  coverWidth: 2048,
  coverHeight: 3072,
  coverLabel: "2048 × 3072 · 2:3 竖图",
  acceptTypes: Object.freeze(["image/png", "image/jpeg", "image/webp"]),
  acceptExt: Object.freeze([".png", ".jpg", ".jpeg", ".webp"]),
  maxBytes: 8 * 1024 * 1024,
  previewMinCount: 1,
  previewMaxCount: 12,
});

export function marketCoverSizeLabel(detail = {}) {
  return detail.dimensions || MARKET_MEDIA.coverLabel;
}
