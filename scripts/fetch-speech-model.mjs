#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alreadyGood, download, mb, refuseMovingBranch, sourcesFor } from "./weights.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "speech-model.json");
const TARGET = process.env.VERBATRACE_SPEECH_MODEL_DIR ?? join(ROOT, ".speech-model");

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const envBase = process.env.VERBATRACE_SPEECH_MODEL_BASE_URL ?? null;
refuseMovingBranch(envBase ?? manifest.baseUrl);

await mkdir(TARGET, { recursive: true });

let fetched = 0;
for (const file of manifest.files) {
  const target = join(TARGET, file.name);

  if (await alreadyGood(target, file)) {
    console.log(`  already present  ${file.name} (${mb(file.size)})`);
    continue;
  }

  process.stdout.write(`  downloading        ${file.name} (${mb(file.size)}) … `);
  const { url, failures } = await download(
    sourcesFor(file, { envBase, origin: manifest.baseUrl, mirrors: manifest.mirrors }),
    target,
    file,
  );
  if (!url) {
    console.log("");
    console.error(`failed to download ${file.name}:`);
    for (const line of failures) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(failures.length ? `verified (fallback: ${url})` : "verified");
  fetched += 1;
}

console.log(
  `\n${TARGET}\nrevision ${manifest.provenance.revision}, license ${manifest.provenance.licence}` +
    `${fetched === 0 ? "\nno download needed" : ""}`,
);
