import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { contentSecurityPolicy } from "./scripts/content-security-policy.mjs";

function addContentSecurityPolicy(): Plugin {
  return {
    name: "add-content-security-policy",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: contentSecurityPolicy,
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// The mock backend is part of a mock build only (SEC-14.AC-1). A mock build serves MSW's worker script
// in the dev server and copies it into `dist/`. A remote build gets neither the script nor the mock:
// the file that starts it (`src/boot-mock.ts`, with MSW, the seed and the store behind it) is swapped
// for an empty one.
function mockBackend(): Plugin {
  const worker = "/mockServiceWorker.js";
  const empty = "\0empty-boot-mock";
  const source = () =>
    readFileSync("node_modules/msw/lib/mockServiceWorker.js");
  let remote = false;
  return {
    name: "mock-backend",
    enforce: "pre",
    configResolved(resolved) {
      const env = loadEnv(resolved.mode, process.cwd(), "VITE_");
      remote = env.VITE_API_MODE === "remote";
    },
    resolveId(id) {
      return remote && /(^|\/)boot-mock$/.test(id) ? empty : undefined;
    },
    load(id) {
      return id === empty ? "export async function bootMock() {}" : undefined;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== worker) return next();
        response.setHeader("Content-Type", "text/javascript");
        response.end(source());
      });
    },
    generateBundle() {
      if (!remote) {
        this.emitFile({
          type: "asset",
          fileName: worker.slice(1),
          source: source(),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), addContentSecurityPolicy(), mockBackend()],
  build: {
    // The policy does not allow data: URLs, so fonts and images stay real files.
    assetsInlineLimit: 0,
  },
});
