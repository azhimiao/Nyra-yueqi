//#region packages/terminal-core/src/ansi.ts
const ESC_ANSI_CSI_PATTERN = "\\x1b\\[[\\x20-\\x3f]*[\\x40-\\x7e]";
const C1_ANSI_CSI_PATTERN = "\\x9b[\\x20-\\x3f]*[\\x40-\\x7e]";
const PARAMETERIZED_C1_ANSI_CSI_PATTERN = "\\x9b[\\x20-\\x3f]+[\\x40-\\x7e]";
const ANSI_CSI_PATTERN = `(?:${ESC_ANSI_CSI_PATTERN}|${C1_ANSI_CSI_PATTERN})`;
const ANSI_OSC_PATTERN = "(?:\\x1b\\]|\\x9d)[^\\x07\\x1b\\x9c]*(?:\\x1b\\\\|\\x07|\\x9c)";
const ANSI_CSI_REGEX = new RegExp(ANSI_CSI_PATTERN, "g");
const ANSI_OSC_REGEX = new RegExp(ANSI_OSC_PATTERN, "g");
const ANSI_SEQUENCE_REGEX = new RegExp(`${ANSI_OSC_PATTERN}|${ANSI_CSI_PATTERN}`, "g");
const SANITIZATION_ANSI_SEQUENCE_REGEX = new RegExp(`${ANSI_OSC_PATTERN}|${ESC_ANSI_CSI_PATTERN}|${PARAMETERIZED_C1_ANSI_CSI_PATTERN}`, "g");
const ANSI_COMPAT_SEQUENCE_REGEX = new RegExp(`(?:\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\u005C|\\u009C))|[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]`, "g");
const graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
function stripAnsi(input) {
	return input.replace(ANSI_OSC_REGEX, "").replace(ANSI_CSI_REGEX, "");
}
/** Strip complete ANSI while preserving ambiguous lone C1 controls for explicit escaping. */
function stripAnsiForSanitization(input) {
	return input.replace(SANITIZATION_ANSI_SEQUENCE_REGEX, "");
}
function stripAnsiSequences(input) {
	if (typeof input !== "string") throw new TypeError(`Expected a \`string\`, got \`${typeof input}\``);
	if (!input.includes("\x1B") && !input.includes("")) return input;
	return input.replace(ANSI_COMPAT_SEQUENCE_REGEX, "");
}
function splitGraphemes(input) {
	if (!input) return [];
	if (!graphemeSegmenter) return Array.from(input);
	try {
		return Array.from(graphemeSegmenter.segment(input), (segment) => segment.segment);
	} catch {
		return Array.from(input);
	}
}
/**
* Sanitize a value for safe interpolation into log messages.
* Strips ANSI escape sequences, C0/C1 control characters, and DEL to
* prevent log forging / terminal escape injection (CWE-117).
*/
function sanitizeForLog(v) {
	const controlCharsRegex = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}${String.fromCharCode(128)}-${String.fromCharCode(159)}]`, "g");
	return stripAnsiForSanitization(v).replace(controlCharsRegex, "");
}
function isZeroWidthCodePoint(codePoint) {
	return codePoint >= 768 && codePoint <= 879 || codePoint >= 6832 && codePoint <= 6911 || codePoint >= 7616 && codePoint <= 7679 || codePoint >= 8400 && codePoint <= 8447 || codePoint >= 65056 && codePoint <= 65071 || codePoint >= 65024 && codePoint <= 65039 || codePoint === 8205;
}
function isFullWidthCodePoint(codePoint) {
	if (codePoint < 4352) return false;
	return codePoint <= 4447 || codePoint === 9001 || codePoint === 9002 || codePoint >= 11904 && codePoint <= 12871 && codePoint !== 12351 || codePoint >= 12880 && codePoint <= 19903 || codePoint >= 19968 && codePoint <= 42182 || codePoint >= 43360 && codePoint <= 43388 || codePoint >= 44032 && codePoint <= 55203 || codePoint >= 63744 && codePoint <= 64255 || codePoint >= 65040 && codePoint <= 65049 || codePoint >= 65072 && codePoint <= 65131 || codePoint >= 65281 && codePoint <= 65376 || codePoint >= 65504 && codePoint <= 65510 || codePoint >= 110576 && codePoint <= 110579 || codePoint >= 110581 && codePoint <= 110587 || codePoint >= 110589 && codePoint <= 110590 || codePoint >= 110592 && codePoint <= 111359 || codePoint >= 127488 && codePoint <= 127569 || codePoint >= 131072 && codePoint <= 262141;
}
const emojiLikePattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
function graphemeWidth(grapheme) {
	if (!grapheme) return 0;
	if (emojiLikePattern.test(grapheme)) return 2;
	let sawPrintable = false;
	for (const char of grapheme) {
		const codePoint = char.codePointAt(0);
		if (codePoint == null) continue;
		if (isZeroWidthCodePoint(codePoint)) continue;
		if (isFullWidthCodePoint(codePoint)) return 2;
		sawPrintable = true;
	}
	return sawPrintable ? 1 : 0;
}
function visibleWidth(input) {
	return splitGraphemes(stripAnsi(input)).reduce((sum, grapheme) => sum + graphemeWidth(grapheme), 0);
}
/**
* Truncate to at most `maxWidth` visible columns, dropping whole grapheme
* clusters that would overflow while preserving ANSI sequences verbatim
* (they have zero visible width). A single wide grapheme that cannot fit the
* remaining budget is dropped rather than emitted partially, so the result is
* always `visibleWidth(result) <= maxWidth`. Callers that need a fixed width
* pad the (possibly short) remainder themselves.
*/
function truncateToVisibleWidth(input, maxWidth) {
	if (maxWidth <= 0) return "";
	if (visibleWidth(input) <= maxWidth) return input;
	ANSI_SEQUENCE_REGEX.lastIndex = 0;
	let out = "";
	let used = 0;
	let pos = 0;
	let budgetSpent = false;
	const appendVisible = (segment) => {
		if (budgetSpent) return;
		for (const grapheme of splitGraphemes(segment)) {
			const width = graphemeWidth(grapheme);
			if (used + width > maxWidth) {
				budgetSpent = true;
				return;
			}
			out += grapheme;
			used += width;
		}
	};
	let match;
	while ((match = ANSI_SEQUENCE_REGEX.exec(input)) !== null) {
		appendVisible(input.slice(pos, match.index));
		out += match[0];
		pos = match.index + match[0].length;
	}
	appendVisible(input.slice(pos));
	return out;
}
//#endregion
export { stripAnsiSequences as a, stripAnsiForSanitization as i, splitGraphemes as n, truncateToVisibleWidth as o, stripAnsi as r, visibleWidth as s, sanitizeForLog as t };
