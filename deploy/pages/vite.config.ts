import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, mergeConfig } from "vite";
import localConfig from "../../vite.config";
import speech from "../../speech-model.json";
import diarization from "../../diarization-model.json";

const partLimit = 20 * 1024 ** 2;
const pagesLimit = 25 * 1024 ** 2;
const output = resolve("dist-pages");
const modelDir = resolve(process.env.VERBATRACE_SPEECH_MODEL_DIR ?? ".speech-model");

interface Weight {
  name: string;
  size: number;
  sha256: string;
}

interface Part {
  path: string;
  bytes: number;
  sha256: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function stageWeights(weights: Weight[], staging: string) {
  const manifest: Record<string, { size: number; tag: string; parts: Part[] }> = {};
  for (const weight of weights) {
    const source = join(modelDir, weight.name);
    if (!await exists(source)) {
      throw new Error(`Missing ${weight.name}. Download the model weights before building for Pages.`);
    }

    const split = weight.size > partLimit;
    const prefix = split ? `chunks/${weight.name}/${weight.sha256}` : "";
    const directory = join(staging, prefix);
    await mkdir(directory, { recursive: true });
    const hash = createHash("sha256");
    const parts: Part[] = [];
    let size = 0;
    for await (const chunk of createReadStream(source, { highWaterMark: partLimit })) {
      hash.update(chunk);
      size += chunk.length;
      if (!split) continue;
      const name = `${String(parts.length).padStart(3, "0")}.part`;
      await writeFile(join(directory, name), chunk);
      parts.push({
        path: `/speech-model/${prefix}/${name}`,
        bytes: chunk.length,
        sha256: createHash("sha256").update(chunk).digest("hex"),
      });
    }

    if (size !== weight.size || hash.digest("hex") !== weight.sha256) {
      throw new Error(`Model checksum or size mismatch: ${weight.name}`);
    }

    if (split) {
      manifest[`/speech-model/${weight.name}`] = { size, tag: weight.sha256, parts };
    } else {
      await copyFile(source, join(staging, weight.name));
    }
  }
  return manifest;
}

export default defineConfig(async ({ command }) => {
  if (command !== "build") throw new Error("Use vite build for the Pages configuration.");
  const weights = [...speech.files, ...diarization.files];
  const staging = await mkdtemp(join(tmpdir(), "verbatrace-pages-"));

  try {
    const manifest = await stageWeights(weights, staging);
    let failed = false;
    return mergeConfig(localConfig, {
      build: { outDir: output, emptyOutDir: true, assetsInlineLimit: 0 },
      define: {
        __PAGES_MODEL_PARTS__: JSON.stringify(manifest),
        "import.meta.env.VITE_SPEECH_MODEL_BASE_URL": JSON.stringify("/speech-model"),
      },
      plugins: [{
        name: "verbatrace-pages-assets",
        buildEnd(error) {
          if (error) failed = true;
        },
        async closeBundle() {
          try {
            if (failed) return;
            await cp(staging, join(output, "speech-model"), { recursive: true });
            await copyFile(new URL("./_headers", import.meta.url), join(output, "_headers"));
            const entries = await readdir(output, { recursive: true, withFileTypes: true });
            for (const file of entries) {
              if (!file.isFile()) continue;
              const path = join(file.parentPath, file.name);
              if ((await stat(path)).size > pagesLimit) throw new Error(`Pages asset exceeds 25 MiB: ${path}`);
            }
          } finally {
            await rm(staging, { force: true, recursive: true });
          }
        },
      }],
    });
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
});
