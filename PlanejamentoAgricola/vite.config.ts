import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const envDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const apiPort = env.PLANEJAMENTO_API_PORT || "8788";

  return {
    envDir,
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      open: true,
      // Permite acesso via ngrok / túnel público (Vite 6+ bloqueia hosts desconhecidos por padrão)
      allowedHosts: true,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
