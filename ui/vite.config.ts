import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { boardPlugin } from "./vite/board";

export default defineConfig({
  base: "./",
  plugins: [react(), boardPlugin()],
  server: { port: 5173, strictPort: true },
});
