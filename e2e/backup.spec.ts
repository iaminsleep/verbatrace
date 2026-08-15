import { expect, test } from "@playwright/test";

async function useEnglish(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("verbatrace-locale", "en");
    localStorage.setItem("verbatrace-theme", "dark");
  });
}

async function seedRecording(page: import("@playwright/test").Page, name: string) {
  await page.evaluate(async (projectName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["projects", "files", "media"], "readwrite");
      transaction.objectStore("projects").put({
        id: 1,
        name: projectName,
        description: null,
        language: "ru",
        enable_diarization: false,
        num_speakers: null,
        created_at: "2026-11-06T00:00:00.000Z",
        tag_ids: [],
      });
      transaction.objectStore("files").put({
        id: 1,
        project_id: 1,
        filename: "fixture.wav",
        size_bytes: 4,
        duration_ms: 1000,
        status: "ready",
        stage: null,
        progress_percent: 100,
        error_message: null,
        notes: "backup note",
        created_at: "2026-11-06T00:00:00.000Z",
        done_seconds: 1,
      });
      transaction.objectStore("media").put({
        file_id: 1,
        blob: new Blob(["test"], { type: "audio/wav" }),
        mime: "audio/wav",
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, name);
}

test("local backup preserves a recording and its media", async ({ page }) => {
  await useEnglish(page);
  await page.goto("/");
  await seedRecording(page, "Backup fixture");
  await page.reload();
  await expect(page.getByText("Backup fixture")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await seedRecording(page, "Changed before restore");
  await page.reload();
  await expect(page.getByText("Changed before restore")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles(backupPath!);
  await expect(page.getByText("Backup fixture")).toBeVisible();
  await expect(page.getByText("Changed before restore")).toHaveCount(0);

  const media = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<string>((resolve, reject) => {
      const request = database.transaction("media", "readonly").objectStore("media").get(1);
      request.onsuccess = async () => resolve(await request.result.blob.text());
      request.onerror = () => reject(request.error);
    });
  });
  expect(media).toBe("test");
});
