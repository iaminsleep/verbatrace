import type { ModelUrls } from "./protocol";

const MODEL_DB = "verbatrace-speech-model";
const MODEL_STORE = "files";

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MODEL_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB"));
  });
}

interface StoredFile {
  blob: Blob;

  tag: string;
  size: number;
}

function readFile(db: IDBDatabase, key: string): Promise<StoredFile | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(MODEL_STORE, "readonly").objectStore(MODEL_STORE).get(key);
    request.onsuccess = () => resolve(request.result as StoredFile | undefined);
    request.onerror = () => reject(request.error ?? new Error("indexedDB read"));
  });
}

function writeFile(db: IDBDatabase, key: string, file: StoredFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MODEL_STORE, "readwrite");
    tx.objectStore(MODEL_STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB write"));
  });
}

interface Stamp {
  size: number;
  tag: string;
}

interface SplitModel extends Stamp {
  parts: { path: string; bytes: number; sha256: string }[];
}

declare const __PAGES_MODEL_PARTS__: Record<string, SplitModel> | undefined;

async function stampOf(url: string): Promise<Stamp | null> {
  const split = __PAGES_MODEL_PARTS__?.[url];
  if (split) return { size: split.size, tag: split.tag };
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok) return null;
    return {
      size: Number(head.headers.get("content-length") ?? 0),
      tag: head.headers.get("etag") ?? head.headers.get("last-modified") ?? "",
    };
  } catch {

    return null;
  }
}

function stale(stored: StoredFile, stamp: Stamp | null): boolean {
  if (!stamp) return false;
  if (stamp.tag && stored.tag) return stamp.tag !== stored.tag;
  return stamp.size > 0 && stamp.size !== stored.size;
}

export interface CachedModel {
  urls: ModelUrls;
  revoke: () => void;
}

export async function cachedFiles(
  urls: string[],
  onProgress: (loaded: number, total: number) => void,
): Promise<Blob[]> {
  let db: IDBDatabase;
  try {
    db = await openModelDb();
  } catch {

    const blobs: Blob[] = [];
    for (const url of urls) blobs.push(await fetchBlob(url, 0, 0, onProgress));
    return blobs;
  }

  const held = await Promise.all(urls.map((url) => readFile(db, url).catch(() => undefined)));
  const stamps = await Promise.all(urls.map(stampOf));
  const wanted = urls.filter((_, at) => {
    const kept = held[at];
    return !kept || stale(kept, stamps[at]);
  });

  let total = 0;
  for (const [at, url] of urls.entries()) {
    if (!wanted.includes(url)) continue;
    const size = stamps[at]?.size ?? 0;
    if (!size) {
      total = 0;
      break;
    }
    total += size;
  }

  let loaded = 0;
  const blobs: Blob[] = [];
  for (const [at, url] of urls.entries()) {
    const kept = held[at];
    if (kept && !wanted.includes(url)) {
      blobs.push(kept.blob);
      continue;
    }

    const blob = await fetchBlob(url, total, loaded, onProgress);
    loaded += blob.size;
    const stamp = stamps[at];
    await writeFile(db, url, {
      blob,
      tag: stamp?.tag ?? "",
      size: stamp?.size || blob.size,
    }).catch(() => {});
    blobs.push(blob);
  }
  return blobs;
}

export async function filesAreCached(urls: string[]): Promise<boolean> {
  try {
    const db = await openModelDb();
    const held = await Promise.all(urls.map((url) => readFile(db, url).catch(() => undefined)));
    return held.every((one) => one != null);
  } catch {
    return false;
  }
}

async function fetchBlob(
  url: string,
  overall: number,
  before: number,
  onProgress: (loaded: number, total: number) => void,
): Promise<Blob> {
  const split = __PAGES_MODEL_PARTS__?.[url];
  if (split) {
    const chunks: Blob[] = [];
    let loaded = 0;
    for (const part of split.parts) {
      const response = await fetch(part.path);
      if (!response.ok) throw new Error(`Could not download model part ${part.path} (${response.status})`);
      const blob = await response.blob();
      if (blob.size !== part.bytes) throw new Error(`Incorrect model part size: ${part.path}`);
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (sha256 !== part.sha256) throw new Error(`Model part checksum mismatch: ${part.path}`);
      chunks.push(blob);
      loaded += blob.size;
      onProgress((overall ? before : 0) + loaded, overall || split.size);
    }
    return new Blob(chunks);
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`веса: ${response.status} для ${url}`);
  }

  const total = overall || Number(response.headers.get("content-length") ?? 0);
  let loaded = overall ? before : 0;
  let shown = -1;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;

        const percent = total ? Math.floor((loaded / total) * 100) : 0;
        if (percent !== shown) {
          shown = percent;
          onProgress(loaded, total);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(counted).blob();
}

export async function cachedModel(
  urls: ModelUrls,
  onProgress: (loaded: number, total: number) => void,
): Promise<CachedModel> {
  const blobs = await cachedFiles([urls.encoder, urls.decoder, urls.tokenizer], onProgress);
  const objectUrls = blobs.map((blob) => URL.createObjectURL(blob));
  return {
    urls: { encoder: objectUrls[0], decoder: objectUrls[1], tokenizer: objectUrls[2] },
    revoke: () => objectUrls.forEach((one) => URL.revokeObjectURL(one)),
  };
}

export function modelIsCached(urls: ModelUrls): Promise<boolean> {
  return filesAreCached([urls.encoder, urls.decoder, urls.tokenizer]);
}
