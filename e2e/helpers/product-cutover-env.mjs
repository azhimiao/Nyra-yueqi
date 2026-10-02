/**
 * Preload env for C6 browser e2e (must run before phone.mjs reads DEMO_URL).
 * Dedicated port avoids colliding with a stale Vite on 5177.
 */
if (!process.env.DEMO_URL) {
  process.env.DEMO_URL = "http://127.0.0.1:5188/";
}
