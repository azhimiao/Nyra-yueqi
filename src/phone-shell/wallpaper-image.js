/**
 * Resize an image file to a wallpaper data URL (JPEG) for localStorage-safe prefs.
 * @param {File|Blob} file
 * @param {{ maxEdge?: number, quality?: number }} [options]
 * @returns {Promise<{ dataUrl: string, tone: "light"|"dark" }>}
 */
export function readImageAsWallpaperDataUrl(file, options = {}) {
  const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : 1080;
  const quality = Number(options.quality) > 0 ? Number(options.quality) : 0.82;
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("无法处理图片");
          ctx.drawImage(img, 0, 0, width, height);
          const tone = estimateTone(ctx, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve({ dataUrl, tone });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("图片无法解码"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function estimateTone(ctx, width, height) {
  const step = Math.max(4, Math.floor(Math.min(width, height) / 24));
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      sum += (pixel[0] * 0.299) + (pixel[1] * 0.587) + (pixel[2] * 0.114);
      count += 1;
    }
  }
  const avg = count ? sum / count : 200;
  return avg < 118 ? "dark" : "light";
}

export function isWallpaperImageValue(value) {
  const text = String(value || "");
  return text.startsWith("data:image/") || /^https?:\/\//i.test(text);
}
