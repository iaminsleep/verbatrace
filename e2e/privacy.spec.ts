import { expect, test, type Page } from "@playwright/test";
import { watchLocalRequests } from "./local-requests";

async function useEnglish(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("verbatrace-locale", "en");
    localStorage.setItem("verbatrace-theme", "dark");
  });
}

function toneWav(seconds = 6): Buffer {
  const rate = 16_000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let at = 0; at < samples; at += 1) {
    const t = at / rate;
    const value =
      0.25 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-((t % 1.5) * 2)) +
      0.12 * Math.sin(2 * Math.PI * 920 * t) * Math.exp(-((t % 1.5) * 3));
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), at * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}


function fileStatus(page: Page, fileId: number) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ status?: string; error_message?: string } | undefined>(
      (resolve, reject) => {
        const request = db.transaction("files", "readonly").objectStore("files").get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    return { status: row?.status ?? null, error: row?.error_message ?? null };
  }, fileId);
}

test("recognition and export stay local in a cross-origin isolated browser", async ({ page, baseURL }) => {
  const unexpected = watchLocalRequests(page, baseURL);

  await useEnglish(page);
  await page.goto("/");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");
  await page.getByRole("button", { name: "Add recording" }).click();
  await page.getByLabel("Name").fill("Privacy test");
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: toneWav(),
  });
  await page.getByRole("button", { name: "Transcribe" }).click();

  await page.waitForURL(/\/editor\/\d+/);
  const fileId = Number(/\/editor\/(\d+)/.exec(page.url())![1]);
  await expect
    .poll(async () => (await fileStatus(page, fileId)).status, { timeout: 8 * 60_000 })
    .toBe("ready");
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download DOCX" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);

  expect(unexpected).toEqual([]);
});
