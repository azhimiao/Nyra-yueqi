import { b as parseStrictPositiveInteger } from "./number-coercion-CJQ8TR--.js";
import "./parse-finite-number-Z7n6tXLk.js";
//#region src/infra/tcp-port.ts
const MAX_TCP_PORT = 65535;
/** Parse a positive TCP port or return null for absent/invalid input. */
function parseTcpPort(raw) {
	if (raw === void 0 || raw === null) return null;
	const parsed = parseStrictPositiveInteger(raw);
	if (parsed === void 0 || parsed > 65535) return null;
	return parsed;
}
//#endregion
export { parseTcpPort as n, MAX_TCP_PORT as t };
