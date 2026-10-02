import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { openclawNodeShimAliases } from "./src/integrations/openclaw-mobile/vite-node-shims.js";

const splashEntry = fileURLToPath(new URL("./src/splash/start.js", import.meta.url));

function splashFirst() {
  return {
    name: "splash-first",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        if (!html.includes("data-boot-screen")) return html;
        const file = Object.values(ctx.bundle).find((chunk) => (
          chunk.type === "chunk" && chunk.name === "splash" && chunk.isEntry
        ));
        if (!file) return html;
        const tag = `<script type="module" crossorigin src="./${file.fileName}"></script>`;
        const stripped = html.replace(new RegExp(`\\s*<script type="module"[^>]*src="[^"]*${file.fileName.replace(".", "\\.")}"[^>]*><\\/script>`, "g"), "");
        return stripped.replace(/<script type="module"/, `${tag}\n    <script type="module"`);
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  root: ".",
  base: "./",
  publicDir: "public",
  plugins: [splashFirst()],
  resolve: {
    alias: openclawNodeShimAliases(),
  },
  esbuild: command === "build"
    ? { drop: ["console", "debugger"] }
    : undefined,
  build: {
    outDir: "www",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    // Keep the first native frame independent from optional feature chunks.
    modulePreload: false,
    rollupOptions: {
      input: {
        splash: splashEntry,
        main: "index.html",
        overlay: "overlay.html",
      },
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, "/");
          if (norm.includes("/src/voice/")) return "voice";
          if (norm.includes("/src/memory/palace") || norm.includes("/src/memory/native-search")) {
            return "palace";
          }
          if (norm.includes("/src/world/")) return "world";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
}));
