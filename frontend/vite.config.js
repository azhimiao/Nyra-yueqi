import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { openclawNodeShimAliases } from "./src/integrations/openclaw-mobile/vite-node-shims.js";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
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
  root: frontendRoot,
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [splashFirst()],
  resolve: {
    alias: openclawNodeShimAliases(),
  },
  esbuild: command === "build" ? { drop: ["console", "debugger"] } : undefined,
  build: {
    outDir: fileURLToPath(new URL("./www", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    modulePreload: false,
    rollupOptions: {
      input: {
        splash: splashEntry,
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        overlay: fileURLToPath(new URL("./overlay.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}));
