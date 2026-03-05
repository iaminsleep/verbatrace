#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alreadyGood, download, mb, refuseMovingBranch, sourcesFor } from "./weights.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "diarization-model.json");
const TARGET = process.env.VERBATRACE_SPEECH_MODEL_DIR ?? join(ROOT, ".speech-model");

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const envBase = process.env.VERBATRACE_DIARIZATION_BASE_URL ?? null;

await mkdir(TARGET, { recursive: true });

for (const file of manifest.files) {
  refuseMovingBranch(envBase ?? file.baseUrl);
  const target = join(TARGET, file.name);

  if (await alreadyGood(target, file)) {
    console.log(`  already present  ${file.name} (${mb(file.size)})`);
    continue;
  }

  process.stdout.write(`  downloading        ${file.name} (${mb(file.size)}) … `);
  const { url, failures } = await download(
    sourcesFor(file, { envBase, origin: file.baseUrl, mirrors: manifest.mirrors }),
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
}

console.log(`\n${TARGET}`);
for (const file of manifest.files) {
  console.log(`  ${file.name} — ${file.provenance.licence}, revision ${file.provenance.revision.slice(0, 8)}`);
}
