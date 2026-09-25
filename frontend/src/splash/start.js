/**
 * Separate entry so the intro runs before the app entry, not inside it.
 *
 * In development `src/main.js` fans out into an unbundled module graph; this
 * module imports nothing but the intro, so the first stroke does not wait for
 * that graph. It also fixes the order the two halves start in.
 */
import { startBootSplash } from "./boot-splash.js";

startBootSplash();
