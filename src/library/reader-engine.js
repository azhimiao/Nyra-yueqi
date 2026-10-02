/**
 * Immersive horizontal ReaderEngine.
 * Page width === viewport.clientWidth (padding lives inside each page).
 * Swipe turns pages; long-press selects text.
 */

import {
  migrateReaderDocument,
  paragraphsAsText,
} from "./reader-document.js";

const PAGE_PAD = Object.freeze({
  top: 56,
  right: 22,
  bottom: 48,
  left: 22,
});

/**
 * @param {{
 *   viewport: HTMLElement,
 *   pagesHost?: HTMLElement,
 *   onPageChange?: (state: { pageIndex: number, pageCount: number, ratio: number }) => void,
 *   onTapCenter?: () => void,
 *   onTapHighlight?: (info: { highlightId: string, mark: HTMLElement, event: PointerEvent }) => boolean,
 *   paragraphClass?: string,
 *   pageClass?: string,
 *   themeHost?: HTMLElement | null,
 * }} opts
 */
export function createReaderEngine(opts = {}) {
  const viewport = opts.viewport;
  if (!viewport) return stubEngine();

  let pagesHost = opts.pagesHost || viewport.querySelector("[data-reader-pages]");
  if (!pagesHost) {
    pagesHost = document.createElement("div");
    pagesHost.className = "reader-engine-pages";
    pagesHost.setAttribute("data-reader-pages", "");
    viewport.append(pagesHost);
  }

  const paragraphClass = opts.paragraphClass || "reader-engine-p";
  const pageClass = opts.pageClass || "reader-engine-page";
  const themeHost = opts.themeHost || viewport.closest(".mini-ebook, .book-reader") || viewport;

  /** @type {import("./reader-document.js").ReaderDocument} */
  let documentModel = migrateReaderDocument("");
  let pageIndex = 0;
  let pageCount = 1;
  let measureRoot = null;
  let destroyed = false;

  /** @type {{ x: number, y: number, t: number, moved: boolean } | null} */
  let gesture = null;

  function emit() {
    opts.onPageChange?.({
      pageIndex,
      pageCount,
      ratio: pageCount <= 1 ? (pageIndex > 0 ? 1 : 0) : pageIndex / (pageCount - 1),
    });
  }

  /** Full slide unit — always the viewport's border box width. */
  function slideWidth() {
    return Math.max(1, Math.round(viewport.clientWidth));
  }

  function slideHeight() {
    return Math.max(1, Math.round(viewport.clientHeight));
  }

  /** Inner text box used for measuring / packing. */
  function textBox() {
    const w = Math.max(80, slideWidth() - PAGE_PAD.left - PAGE_PAD.right);
    const h = Math.max(80, slideHeight() - PAGE_PAD.top - PAGE_PAD.bottom - 8);
    return { width: w, height: h };
  }

  function ensureMeasureRoot() {
    if (measureRoot?.isConnected) return measureRoot;
    measureRoot = document.createElement("div");
    measureRoot.className = "reader-engine-measure";
    measureRoot.setAttribute("aria-hidden", "true");
    document.body.append(measureRoot);
    return measureRoot;
  }

  function syncMeasureStyles(target, width) {
    const cs = window.getComputedStyle(viewport);
    target.style.cssText = [
      `width:${width}px`,
      "padding:0",
      "margin:0",
      "box-sizing:border-box",
      `font-family:${cs.fontFamily}`,
      `font-size:${cs.fontSize}`,
      `line-height:${cs.lineHeight}`,
      `letter-spacing:${cs.letterSpacing}`,
      `font-weight:${cs.fontWeight}`,
      "text-align:justify",
      "word-break:break-word",
      "overflow-wrap:anywhere",
    ].join(";");
  }

  function paraClassName(para) {
    const bits = [paragraphClass];
    if (para.kind === "toc" || para.kind === "toc-item") bits.push("is-toc");
    else if (para.kind === "heading") bits.push("is-heading");
    return bits.join(" ");
  }

  function buildPageBuckets() {
    const paragraphs = documentModel.paragraphs || [];
    if (!paragraphs.length) return [[]];
    if (slideWidth() < 40 || slideHeight() < 40) return [paragraphs.slice()];

    const { width, height: maxH } = textBox();
    const measure = ensureMeasureRoot();
    syncMeasureStyles(measure, width);
    measure.innerHTML = "";

    /** @type {import("./reader-document.js").ReaderParagraph[][]} */
    const pages = [];
    /** @type {import("./reader-document.js").ReaderParagraph[]} */
    let bucket = [];
    const probe = document.createElement("div");
    measure.append(probe);

    for (const para of paragraphs) {
      if (
        bucket.length
        && para.kind === "heading"
        && /^(第[一二三四五六七八九十百千]+部分|第?\s*\d+\s*章|[Cc]hapter\s*\d+)/.test(para.text)
        && bucket.some((row) => row.kind === "body")
      ) {
        pages.push(bucket);
        bucket = [];
        probe.innerHTML = "";
      }

      const node = document.createElement("p");
      node.className = paraClassName(para);
      node.textContent = para.text;
      probe.append(node);

      if (probe.scrollHeight > maxH && bucket.length) {
        pages.push(bucket);
        bucket = [para];
        probe.innerHTML = "";
        const again = document.createElement("p");
        again.className = node.className;
        again.textContent = para.text;
        probe.append(again);
        if (probe.scrollHeight > maxH) {
          pages.push(bucket);
          bucket = [];
          probe.innerHTML = "";
        }
      } else {
        bucket.push(para);
      }
    }
    if (bucket.length) pages.push(bucket);
    measure.innerHTML = "";
    return pages.length ? pages : [[]];
  }

  function applyTransform() {
    const w = slideWidth();
    const h = slideHeight();
    pagesHost.style.display = "flex";
    pagesHost.style.flexDirection = "row";
    pagesHost.style.flexWrap = "nowrap";
    pagesHost.style.alignItems = "stretch";
    pagesHost.style.height = `${h}px`;
    pagesHost.style.width = `${pageCount * w}px`;
    pagesHost.style.transform = `translate3d(${-pageIndex * w}px, 0, 0)`;
    pagesHost.querySelectorAll(`.${pageClass}`).forEach((page) => {
      page.style.flex = `0 0 ${w}px`;
      page.style.width = `${w}px`;
      page.style.minWidth = `${w}px`;
      page.style.maxWidth = `${w}px`;
      page.style.height = `${h}px`;
      page.style.overflow = "hidden";
      page.style.boxSizing = "border-box";
      page.style.padding = `${PAGE_PAD.top}px ${PAGE_PAD.right}px ${PAGE_PAD.bottom}px ${PAGE_PAD.left}px`;
    });
  }

  function renderPages() {
    const buckets = buildPageBuckets();
    pageCount = Math.max(1, buckets.length);
    pageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
    pagesHost.innerHTML = "";

    buckets.forEach((bucket, index) => {
      const page = document.createElement("div");
      page.className = pageClass;
      page.dataset.pageIndex = String(index);
      if (!bucket.length) {
        const empty = document.createElement("p");
        empty.className = `${paragraphClass} is-empty`;
        page.append(empty);
      } else {
        bucket.forEach((para) => {
          const node = document.createElement("p");
          node.className = paraClassName(para);
          node.dataset.pId = para.id;
          node.dataset.pIndex = para.id.replace(/^p/, "");
          node.textContent = para.text;
          page.append(node);
        });
      }
      pagesHost.append(page);
    });
    applyTransform();
    emit();
  }

  function setDocument(input, { sourceFormat = "", ratio = 0, pageIndex: restorePage } = {}) {
    documentModel = migrateReaderDocument(input, { sourceFormat });
    pageIndex = Number.isFinite(restorePage) ? Math.max(0, Math.floor(restorePage)) : 0;
    renderPages();
    requestAnimationFrame(() => {
      if (destroyed) return;
      remasure(true);
      if (!Number.isFinite(restorePage) && ratio > 0) goToRatio(ratio);
    });
    if (!Number.isFinite(restorePage) && ratio > 0) goToRatio(ratio);
    return getState();
  }

  function goPage(delta) {
    const next = Math.max(0, Math.min(pageCount - 1, pageIndex + Number(delta || 0)));
    if (next === pageIndex) return getState();
    pageIndex = next;
    applyTransform();
    emit();
    return getState();
  }

  function goToPage(index) {
    pageIndex = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(index) || 0)));
    applyTransform();
    emit();
    return getState();
  }

  function goToRatio(ratio) {
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    pageIndex = pageCount <= 1 ? 0 : Math.round(r * (pageCount - 1));
    applyTransform();
    emit();
    return getState();
  }

  function remasure(keepRatio = true) {
    const ratio = keepRatio
      ? (pageCount <= 1 ? 0 : pageIndex / Math.max(1, pageCount - 1))
      : 0;
    renderPages();
    if (keepRatio) goToRatio(ratio);
    return getState();
  }

  function getState() {
    return {
      pageIndex,
      pageCount,
      ratio: pageCount <= 1 ? (pageIndex > 0 ? 1 : 0) : pageIndex / (pageCount - 1),
      paragraphs: paragraphsAsText(documentModel),
      document: documentModel,
    };
  }

  function hasLiveSelection() {
    const sel = window.getSelection?.();
    return Boolean(sel && !sel.isCollapsed && String(sel.toString() || "").trim());
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gesture = {
      x: event.clientX,
      y: event.clientY,
      t: Date.now(),
      moved: false,
      id: event.pointerId,
    };
    // Do NOT setPointerCapture — it blocks native long-press text selection.
  }

  function onPointerMove(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) gesture.moved = true;
  }

  function onPointerUp(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const dt = Date.now() - gesture.t;
    const moved = gesture.moved || Math.abs(dx) > 8 || Math.abs(dy) > 8;
    gesture = null;

    // Long-press / active selection → never steal the gesture for paging.
    if (hasLiveSelection() || dt >= 380) return;

    // Horizontal swipe → page turn.
    if (moved && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goPage(dx < 0 ? 1 : -1);
      return;
    }

    // Short tap on a commented highlight → fold the note (before paging / chrome).
    if (!moved && typeof opts.onTapHighlight === "function") {
      const raw = event.target?.nodeType === 1
        ? event.target
        : event.target?.parentElement
          || (typeof document !== "undefined" ? document.elementFromPoint(event.clientX, event.clientY) : null);
      const mark = raw?.closest?.("mark.ebook-hl-mark");
      const highlightId = String(mark?.getAttribute?.("data-hl-id") || "").trim();
      if (highlightId && opts.onTapHighlight({ highlightId, mark, event })) return;
    }

    // Short tap in center third → chrome toggle (optional).
    if (!moved && typeof opts.onTapCenter === "function") {
      const rect = viewport.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
      if (ratio >= 0.28 && ratio <= 0.72) opts.onTapCenter();
      else if (ratio < 0.28) goPage(-1);
      else goPage(1);
    }
  }

  function onPointerCancel() {
    gesture = null;
  }

  function onResize() {
    if (!destroyed) remasure(true);
  }

  let resizeObserver = null;
  let lastBox = { w: 0, h: 0 };
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      if (destroyed) return;
      // Opening from [hidden] often skips window.resize — remasure when box appears.
      const w = slideWidth();
      const h = slideHeight();
      if (w < 40 || h < 40) return;
      if (w === lastBox.w && h === lastBox.h) return;
      lastBox = { w, h };
      remasure(true);
    });
    resizeObserver.observe(viewport);
  }

  viewport.classList.add("reader-engine-viewport");
  pagesHost.classList.add("reader-engine-pages");
  viewport.style.touchAction = "manipulation";
  viewport.style.userSelect = "text";
  viewport.style.webkitUserSelect = "text";

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("resize", onResize);

  return {
    setDocument,
    remasure,
    goPage,
    goToPage,
    goToRatio,
    getState,
    getDocument: () => documentModel,
    getPagesHost: () => pagesHost,
    findParagraphIndexFromNode(node) {
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      const p = el?.closest?.(`[data-p-id], .${paragraphClass}`);
      if (!p) return -1;
      const id = p.getAttribute("data-p-id") || "";
      const idx = documentModel.paragraphs.findIndex((row) => row.id === id);
      if (idx >= 0) return idx;
      const raw = Number(p.dataset.pIndex);
      return Number.isFinite(raw) ? raw : -1;
    },
    setTheme(theme) {
      themeHost?.setAttribute("data-ebook-theme", theme || "paper");
    },
    destroy() {
      destroyed = true;
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      if (measureRoot?.isConnected) measureRoot.remove();
      measureRoot = null;
    },
  };
}

function stubEngine() {
  const empty = {
    pageIndex: 0,
    pageCount: 1,
    ratio: 0,
    paragraphs: [],
    document: migrateReaderDocument(""),
  };
  return {
    setDocument: () => empty,
    remasure: () => empty,
    goPage: () => empty,
    goToPage: () => empty,
    goToRatio: () => empty,
    getState: () => empty,
    getDocument: () => empty.document,
    getPagesHost: () => null,
    findParagraphIndexFromNode: () => -1,
    setTheme() {},
    destroy() {},
  };
}
