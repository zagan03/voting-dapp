import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  resolve: {
    alias: {
      "@coral-xyz/anchor": path.resolve(
        __dirname,
        "node_modules/@coral-xyz/anchor/dist/browser/index.js"
      ),
    },
    dedupe: ["@coral-xyz/anchor", "react", "react-dom"],
  },
});
