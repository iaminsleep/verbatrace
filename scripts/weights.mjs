

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const mb = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function alreadyGood(path, file) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return false;
  }
  if (info.size !== file.size) return false;
  return (await sha256(path)) === file.sha256;
}

export function refuseMovingBranch(url) {
  if (/\/(main|master)(\/|$)/.test(url)) {
    console.error(
      `URL points to a moving branch: ${url}\n` +
        "Models must use a fixed revision to prevent unexpected changes.",
    );
    process.exit(1);
  }
}

export function sourcesFor(file, { envBase, origin, mirrors = [] }) {
  const trim = (url) => url.replace(/\/$/, "");
  const list = [];
  if (envBase) list.push(`${trim(envBase)}/${file.name}`);
  if (origin) list.push(`${trim(origin)}/${file.remote ?? file.name}`);
  for (const mirror of mirrors) list.push(`${trim(mirror)}/${file.name}`);
  return list;
}

export async function download(sources, target, file) {
  const part = `${target}.part`;
  const failures = [];

  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        failures.push(`${response.status} ${url}`);
        continue;
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(part));

      const size = (await stat(part)).size;
      if (size !== file.size) {
        failures.push(`size ${size} instead of ${file.size} — ${url}`);
        await unlink(part).catch(() => {});
        continue;
      }
      const digest = await sha256(part);
      if (digest !== file.sha256) {
        failures.push(`SHA-256 mismatch — ${url}`);
        await unlink(part).catch(() => {});
        continue;
      }

      await rename(part, target);
      return { url, failures };
    } catch (error) {
      failures.push(`${String(error.message).slice(0, 80)} — ${url}`);
      await unlink(part).catch(() => {});
    }
  }

  return { url: null, failures };
}
