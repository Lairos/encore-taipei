import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/config.js";

export default defineConfig({
  site: SITE.url,
  trailingSlash: "always",
  integrations: [sitemap()],
  vite: { build: { target: "es2022", chunkSizeWarningLimit: 900 } },
});
