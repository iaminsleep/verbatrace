#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInside } from "./safe-path.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const MODELS = process.env.VERBATRACE_SPEECH_MODEL_DIR ?? join(ROOT, ".speech-model");
const MODEL_ROUTE = "/speech-model/";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const port = Number(flag("port", process.env.PORT ?? 5173));

const host = flag("host", "localhost");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const ISOLATION = {
  "cross-origin-opener-policy": "same-origin",

  "cross-origin-embedder-policy": "credentialless",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  ...ISOLATION,
};

async function send(res, file, method) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Not a regular file");
  const modelRoot = resolve(MODELS);
  const immutable =
    file === modelRoot ||
    file.startsWith(`${modelRoot}${sep}`) ||
    /\.[0-9a-zA-Z_-]{8,}\./.test(file);
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(info.size),
    "last-modified": new Date(info.mtimeMs).toUTCString(),

    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    ...SECURITY_HEADERS,
    ...(file === modelRoot || file.startsWith(`${modelRoot}${sep}`)
      ? { "cross-origin-resource-policy": "same-origin" }
      : {}),
  });

  if (method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];

  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return res.writeHead(405, { ...SECURITY_HEADERS, allow: "GET, HEAD" }).end();
    }
    if (path.startsWith(MODEL_ROUTE)) {
      const file = resolveInside(MODELS, path.slice(MODEL_ROUTE.length));
      if (!file) return res.writeHead(403, SECURITY_HEADERS).end();
      try {
        return await send(res, file, req.method);
      } catch {
        res.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
        return res.end(
          `Model file not found: ${path}\n\n` +
            `Download models:  npm run speech-model\n` +
            `Speaker models:      npm run diarization-model\n` +
            `Or specify an existing directory: VERBATRACE_SPEECH_MODEL_DIR=<path> npm run serve\n`,
        );
      }
    }

    const asked = resolveInside(DIST, path === "/" ? "index.html" : path.slice(1));
    if (!asked) return res.writeHead(403, SECURITY_HEADERS).end();
    try {
      return await send(res, asked, req.method);
    } catch {

      return await send(res, join(DIST, "index.html"), req.method);
    }
  } catch {
    res.writeHead(500, SECURITY_HEADERS).end();
  }
});

try {
  await stat(join(DIST, "index.html"));
} catch {
  console.error(`Application build not found in ${DIST}\n\nBuild it:  npm run build`);
  process.exit(1);
}

let modelsReady = true;
try {
  await stat(join(MODELS, "vocab.txt"));
} catch {
  modelsReady = false;
}

server.listen(port, host, () => {
  console.log(`\n  Verbatrace  →  http://${host}:${port}\n`);
  console.log(`  models: ${MODELS}${modelsReady ? "" : "   ← empty, see below"}`);
  if (!modelsReady) {
    console.log(
      `\n  Models are missing. Recognition requires them:\n` +
        `    npm run speech-model        670 MB, with SHA-256 verification\n` +
        `    npm run diarization-model   another 28 MB for speaker identification\n`,
    );
  }
  console.log(
    `\n  After opening, check that crossOriginIsolated is true in the browser console.` +
      `\n  If false, recognition will be slower.\n`,
  );
});
