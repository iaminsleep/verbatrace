import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveInside } from "./scripts/safe-path.mjs";

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  ...ISOLATION,
};

const DEV_SECURITY_HEADERS = SECURITY_HEADERS;

const MODEL_DIR =
  process.env.VERBATRACE_SPEECH_MODEL_DIR ??
  fileURLToPath(new URL("./.speech-model", import.meta.url));

const MODEL_ROUTE = "/speech-model/";

type Middleware = (
  req: { url?: string; method?: string },
  res: import("node:http").ServerResponse,
  next: () => void,
) => void;

const serveWeights: Middleware = (req, res, next) => {
  const path = (req.url ?? "").split("?")[0];
  if (!path.startsWith(MODEL_ROUTE)) return next();

  const file = resolveInside(MODEL_DIR, path.slice(MODEL_ROUTE.length));
  if (!file || !existsSync(file)) {
    res.statusCode = 404;
    Object.entries(SECURITY_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
    res.end("Model file not found. Run npm run speech-model.\n");
    return;
  }

  const { size, mtimeMs } = statSync(file);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
  res.setHeader("content-type", "application/octet-stream");
  res.setHeader("content-length", String(size));

  res.setHeader("last-modified", new Date(mtimeMs).toUTCString());
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
};

function speechModel(): Plugin {
  return {
    name: "verbatrace-speech-model",
    configureServer(server) {
      server.middlewares.use(serveWeights);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveWeights);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), speechModel()],
  define: { __PAGES_MODEL_PARTS__: "undefined" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },

  worker: { format: "es" },

  preview: { headers: ISOLATION },
  server: {

    host: "localhost",
    port: 5173,
    strictPort: true,
    headers: DEV_SECURITY_HEADERS,
  },

  optimizeDeps: {
    exclude: ["@sherpaw/speaker-diarization"],
    include: ["nanoid", "@moeru/eventa > picomatch", "@moeru/eventa > nanoid"],
  },
});
