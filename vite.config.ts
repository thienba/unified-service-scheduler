import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// The Content Security Policy (D-0000-29, SEC-15.AC-1). It goes into the built
// page only: the dev server needs inline scripts that this policy would block.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

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

export default defineConfig({
  plugins: [tailwindcss(), addContentSecurityPolicy()],
  build: {
    // The policy does not allow data: URLs, so fonts and images stay real files.
    assetsInlineLimit: 0,
  },
});
